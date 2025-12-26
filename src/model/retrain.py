"""

To add new classes while keeping existing ones:
python retrain.py --data_dir new_data --original_model output/best_model.pth --class_info output/class_info.json --output_dir updated_output


To retrain specific classes only:
python retrain.py --data_dir new_data --original_model output/best_model.pth --class_info output/class_info.json --include_classes bird cat dog


To train on all layers (not just the classifier):
python retrain.py --data_dir new_data --original_model output/best_model.pth --class_info output/class_info.json --retrain_all




Use "Adding new classes" if:

You want to train the model to recognize completely new categories that weren't in the original model
You want to keep all the original classes and just add more



Use "Retraining specific classes" if:

You want to improve performance on just a few specific classes
You don't need to modify the entire model
You have new/better data for only certain classes



Use "Training on all layers" if:

Your new data is significantly different from what the model was originally trained on
You have enough data to justify full retraining
You want to maximize performance and have the computational resources for it



ok? halla2 ente badak bass testa3mil awal option yemkin, bass 7asab


"""
import math

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, Subset
from torchvision import transforms, models
import numpy as np
import os
import pathlib
from PIL import Image
import logging
import json
import argparse
import time
from torch.optim.lr_scheduler import ReduceLROnPlateau
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("retraining.log"),
        logging.StreamHandler()
    ]
)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class TransformFactory:
    @staticmethod
    def get_transforms(resolution=224, mode='train'):
        normalize = transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )

        if mode == 'train':
            return transforms.Compose([
                transforms.RandomResizedCrop(resolution, scale=(0.7, 1.0)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.RandomVerticalFlip(p=0.3),
                transforms.RandomRotation(30),
                transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.15),
                transforms.RandomAffine(degrees=10, translate=(0.15, 0.15), scale=(0.8, 1.2)),
                transforms.RandomPerspective(distortion_scale=0.2, p=0.5),
                transforms.ToTensor(),
                normalize,
                transforms.RandomErasing(p=0.3)
            ])
        else:
            return transforms.Compose([
                transforms.Resize((resolution, resolution)),
                transforms.ToTensor(),
                normalize
            ])


class ImageClassificationDataset(Dataset):
    def __init__(self, root_dir, transform=None, img_size=224, transform_on_cpu=False,
                 include_classes=None, exclude_classes=None):
        self.root_dir = pathlib.Path(root_dir)
        self.transform = transform
        self.img_size = img_size
        self.transform_on_cpu = transform_on_cpu

        all_classes = sorted([d.name for d in self.root_dir.iterdir() if d.is_dir()])

        if include_classes:
            self.class_names = [c for c in all_classes if c in include_classes]
        elif exclude_classes:
            self.class_names = [c for c in all_classes if c not in exclude_classes]
        else:
            self.class_names = all_classes

        self.num_classes = len(self.class_names)
        self.samples = []

        self.class_to_idx = {class_name: idx for idx, class_name in enumerate(self.class_names)}

        for class_name in self.class_names:
            class_dir = self.root_dir / class_name
            class_idx = self.class_to_idx[class_name]
            for img_path in class_dir.glob('*.*'):
                if img_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                    self.samples.append((str(img_path), class_idx))

        logging.info(f"Found {len(self.samples)} images across {self.num_classes} classes")
        for class_name in self.class_names:
            count = sum(1 for _, idx in self.samples if idx == self.class_to_idx[class_name])
            logging.info(f"  - {class_name}: {count} images")

    def __len__(self):
        return len(self.samples)

    def getitem(self, idx):

        img_path, label = self.samples[idx]

        try:

            with Image.open(img_path) as img:

                if img.mode == 'P' and 'transparency' in img.info:
                    image = img.convert('RGBA')
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(image, mask=image.split()[3])
                    image = background
                else:
                    image = img.convert('RGB')

                if self.transform_on_cpu and self.transform:
                    with torch.no_grad():
                        image = self.transform(image)

                return image, label

        except Exception as e:
            logging.error(f"Error loading image {img_path}: {e}")
            return torch.zeros((3, self.img_size, self.img_size)), label

    def get_class_distribution(self):
        counts = np.zeros(self.num_classes)
        for _, label in self.samples:
            counts[label] += 1
        return counts


def create_data_loaders(dataset, batch_size=32, val_split=0.15, num_workers=4):
    dataset_size = len(dataset)
    indices = list(range(dataset_size))
    split = int(np.floor(val_split * dataset_size))

    np.random.shuffle(indices)
    train_indices, val_indices = indices[split:], indices[:split]

    train_dataset = Subset(dataset, train_indices)
    val_dataset = Subset(dataset, val_indices)

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True
    )

    return train_loader, val_loader


def calculate_class_weights(dataset):
    counts = dataset.get_class_distribution()
    min_count = max(counts.min(), 5)
    counts = np.maximum(counts, min_count)

    weights = 1.0 / counts
    max_weight = 3.0 * weights.mean()
    weights = np.minimum(weights, max_weight)

    normalized_weights = weights / weights.sum() * len(weights)
    normalized_weights = np.clip(normalized_weights, 0.5, 2.0)

    logging.info(f"Class weights: {normalized_weights}")
    return torch.tensor(normalized_weights, dtype=torch.float32).to(device)


class ModelUpdater:
    def __init__(self, original_model_path, class_info_path, model_name='efficientnet_v2_s'):
        self.model_name = model_name
        self.original_model_path = original_model_path

        with open(class_info_path, 'r') as f:
            self.original_class_info = json.load(f)

        self.original_class_names = self.original_class_info['class_names']
        logging.info(f"Original model has {len(self.original_class_names)} classes: {self.original_class_names}")

    def create_updated_model(self, new_class_names):
        num_classes = len(new_class_names)
        logging.info(f"Creating updated model with {num_classes} classes: {new_class_names}")

        original_to_new_idx = {}
        for i, class_name in enumerate(self.original_class_names):
            if class_name in new_class_names:
                original_to_new_idx[i] = new_class_names.index(class_name)

        if self.model_name == 'efficientnet_v2_s':
            new_model = models.efficientnet_v2_s(weights='DEFAULT')
            num_ftrs = new_model.classifier[1].in_features
            new_model.classifier = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(num_ftrs, num_classes)
            )
        elif self.model_name == 'resnet50':
            new_model = models.resnet50(weights='DEFAULT')
            num_ftrs = new_model.fc.in_features
            new_model.fc = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(num_ftrs, num_classes)
            )
        elif self.model_name == 'mobilenet_v3_large':
            new_model = models.mobilenet_v3_large(weights='DEFAULT')
            num_ftrs = new_model.classifier[3].in_features
            new_model.classifier[3] = nn.Linear(num_ftrs, num_classes)
        else:
            raise ValueError(f"Model {self.model_name} not supported")

        new_model = new_model.to(device)

        try:
            checkpoint = torch.load(self.original_model_path, map_location=device, weights_only=False)
            original_model_dict = checkpoint['model_state_dict']

            new_model_dict = new_model.state_dict()
            for k, v in original_model_dict.items():
                if 'classifier.1' in k or 'fc.1' in k or k == 'classifier.3.weight' or k == 'classifier.3.bias':
                    continue
                new_model_dict[k] = v

            if self.model_name == 'efficientnet_v2_s':
                orig_weights = original_model_dict['classifier.1.weight']
                orig_bias = original_model_dict['classifier.1.bias']

                for orig_idx, new_idx in original_to_new_idx.items():
                    new_model_dict['classifier.1.weight'][new_idx] = orig_weights[orig_idx]
                    new_model_dict['classifier.1.bias'][new_idx] = orig_bias[orig_idx]

            elif self.model_name == 'resnet50':
                orig_weights = original_model_dict['fc.1.weight']
                orig_bias = original_model_dict['fc.1.bias']

                for orig_idx, new_idx in original_to_new_idx.items():
                    new_model_dict['fc.1.weight'][new_idx] = orig_weights[orig_idx]
                    new_model_dict['fc.1.bias'][new_idx] = orig_bias[orig_idx]

            elif self.model_name == 'mobilenet_v3_large':
                orig_weights = original_model_dict['classifier.3.weight']
                orig_bias = original_model_dict['classifier.3.bias']

                for orig_idx, new_idx in original_to_new_idx.items():
                    new_model_dict['classifier.3.weight'][new_idx] = orig_weights[orig_idx]
                    new_model_dict['classifier.3.bias'][new_idx] = orig_bias[orig_idx]

            new_model.load_state_dict(new_model_dict)
            logging.info("Successfully transferred weights from original model to new model")

        except Exception as e:
            logging.error(f"Error loading original model weights: {e}")
            logging.warning("Continuing with randomly initialized weights for the classifier")

        return new_model

    def train_model(self, model, train_loader, val_loader, learning_rate=1e-4,
                    epochs=10, early_stopping_patience=3, use_class_weights=True):
        optimizer = optim.AdamW(
            model.parameters(),
            lr=learning_rate,
            weight_decay=5e-4,
            eps=1e-8
        )

        if use_class_weights:
            class_weights = calculate_class_weights(train_loader.dataset.dataset)
            criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.2, reduction='mean')
        else:
            criterion = nn.CrossEntropyLoss(label_smoothing=0.2, reduction='mean')

        scheduler = ReduceLROnPlateau(optimizer, mode='min', factor=0.3, patience=2, min_lr=1e-6)

        best_val_loss = float('inf')
        patience_counter = 0

        for epoch in range(epochs):
            model.train()
            train_loss = 0.0
            correct = 0
            total = 0
            batch_count = 0

            train_pbar = tqdm(train_loader, desc=f"Epoch {epoch + 1}/{epochs} [Train]")
            for inputs, labels in train_pbar:
                inputs, labels = inputs.to(device), labels.to(device)

                optimizer.zero_grad()

                outputs = model(inputs)
                loss = criterion(outputs, labels)

                loss = loss + 1e-6

                if torch.isnan(loss) or torch.isinf(loss):
                    logging.warning(f"NaN or Inf loss detected during training. Using fallback loss.")
                    loss = torch.tensor(0.1, device=device, requires_grad=True)

                loss.backward()

                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)

                optimizer.step()

                if torch.isnan(loss):
                    logging.warning("NaN detected after optimizer step. Skipping batch accumulation.")
                    continue

                train_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()
                batch_count += 1

                has_nan = False
                for name, param in model.named_parameters():
                    if torch.isnan(param).any():
                        logging.warning(f"NaN detected in parameter {name}")
                        has_nan = True
                        break

                if has_nan:
                    logging.warning("Detected NaN in model parameters. Loading previous checkpoint.")
                    try:
                        checkpoint = torch.load('best_retrained_model.pth')
                        model.load_state_dict(checkpoint['model_state_dict'])
                        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                    except:
                        logging.error("Could not load checkpoint. Continuing with current model state.")

                safe_train_loss = train_loss / max(batch_count, 1)
                safe_accuracy = 100. * correct / max(total, 1)

                train_pbar.set_postfix({
                    'loss': safe_train_loss,
                    'acc': safe_accuracy
                })

            safe_train_loss = train_loss / max(len(train_loader), 1)
            safe_train_acc = 100. * correct / max(total, 1)

            if math.isnan(safe_train_loss) or safe_train_loss < 1e-7:
                safe_train_loss = 1e-7
                logging.warning("Train loss too small or NaN, using minimum value")

            model.eval()
            val_loss = 0.0
            val_correct = 0
            val_total = 0
            val_batch_count = 0

            with torch.no_grad():
                val_pbar = tqdm(val_loader, desc=f"Epoch {epoch + 1}/{epochs} [Val]")
                for inputs, labels in val_pbar:
                    inputs, labels = inputs.to(device), labels.to(device)

                    outputs = model(inputs)
                    loss = criterion(outputs, labels)

                    loss = loss + 1e-6

                    if torch.isnan(loss) or torch.isinf(loss):
                        logging.warning("NaN or Inf detected in validation loss. Skipping batch.")
                        continue

                    val_loss += loss.item()
                    _, predicted = outputs.max(1)
                    val_total += labels.size(0)
                    val_correct += predicted.eq(labels).sum().item()
                    val_batch_count += 1

                    safe_val_loss = val_loss / max(val_batch_count, 1)
                    safe_val_acc = 100. * val_correct / max(val_total, 1)

                    val_pbar.set_postfix({
                        'loss': safe_val_loss,
                        'acc': safe_val_acc
                    })

            avg_val_loss = val_loss / max(val_batch_count, 1) if val_batch_count > 0 else 1.0
            val_acc = 100. * val_correct / max(val_total, 1) if val_total > 0 else 0.0

            if math.isnan(avg_val_loss) or avg_val_loss < 1e-7:
                avg_val_loss = 1e-7
                logging.warning("Validation loss is NaN or too small, using minimum value")

            if math.isnan(val_acc):
                val_acc = 0.0
                logging.warning("Validation accuracy is NaN, using zero")

            logging.info(f"Epoch {epoch + 1}/{epochs}: "
                         f"Train Loss: {safe_train_loss:.4f}, Train Acc: {safe_train_acc:.2f}%, "
                         f"Val Loss: {avg_val_loss:.4f}, Val Acc: {val_acc:.2f}%")

            try:
                scheduler.step(avg_val_loss)
            except Exception as e:
                logging.error(f"Error in scheduler step: {e}")
                logging.warning("Skipping scheduler step for this epoch")

            if not math.isnan(avg_val_loss) and avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                patience_counter = 0

                torch.save({
                    'epoch': epoch,
                    'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'val_loss': avg_val_loss,
                    'val_acc': val_acc
                }, 'best_retrained_model.pth')
                logging.info(f"Saved best model with validation loss: {avg_val_loss:.4f}")
            else:
                patience_counter += 1
                if patience_counter >= early_stopping_patience:
                    logging.info(f"Early stopping triggered after {epoch + 1} epochs")
                    break

        try:
            checkpoint = torch.load('best_retrained_model.pth')
            model.load_state_dict(checkpoint['model_state_dict'])
            return model, checkpoint.get('val_acc', 0.0)
        except Exception as e:
            logging.error(f"Error loading best model: {e}")
            return model, 0.0


def save_model_with_class_info(model, class_names, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    model_path = os.path.join(output_dir, 'best_model.pth')
    torch.save({
        'model_state_dict': model.state_dict(),
        'val_acc': 0.0,
    }, model_path)

    class_info = {
        'class_names': class_names,
        'num_classes': len(class_names)
    }
    class_info_path = os.path.join(output_dir, 'class_info.json')
    with open(class_info_path, 'w') as f:
        json.dump(class_info, f, indent=4)

    logging.info(f"Model and class info saved to {output_dir}")
    return model_path, class_info_path


def main():
    parser = argparse.ArgumentParser(description='Retrain image classification model with new or updated classes')
    parser.add_argument('--data_dir', type=str, required=True, help='Path to data directory with all classes')
    parser.add_argument('--original_model', type=str, required=True, help='Path to original model file')
    parser.add_argument('--class_info', type=str, required=True, help='Path to original class info JSON file')
    parser.add_argument('--output_dir', type=str, default='retrained_model', help='Directory to save retrained model')
    parser.add_argument('--model', type=str, default='efficientnet_v2_s',
                        choices=['efficientnet_v2_s', 'resnet50', 'mobilenet_v3_large'],
                        help='Model architecture')
    parser.add_argument('--img_size', type=int, default=224, help='Image size for training')
    parser.add_argument('--batch_size', type=int, default=32, help='Batch size for training')
    parser.add_argument('--epochs', type=int, default=10, help='Number of epochs to train for')
    parser.add_argument('--lr', type=float, default=1e-4, help='Learning rate')
    parser.add_argument('--include_classes', type=str, nargs='+', help='Only include these classes (space separated)')
    parser.add_argument('--exclude_classes', type=str, nargs='+', help='Exclude these classes (space separated)')
    parser.add_argument('--retrain_all', action='store_true', help='Retrain all layers (not just classifier)')
    parser.add_argument('--no_class_weights', action='store_true', help='Disable class weights')

    args = parser.parse_args()

    if args.include_classes and args.exclude_classes:
        raise ValueError("Cannot specify both --include_classes and --exclude_classes")

    start_time = time.time()
    logging.info(f"Starting model retraining with data from {args.data_dir}")

    dataset = ImageClassificationDataset(
        root_dir=args.data_dir,
        transform=TransformFactory.get_transforms(resolution=args.img_size, mode='train'),
        img_size=args.img_size,
        transform_on_cpu=True,
        include_classes=args.include_classes,
        exclude_classes=args.exclude_classes
    )

    train_loader, val_loader = create_data_loaders(
        dataset,
        batch_size=args.batch_size,
        val_split=0.15,
        num_workers=min(8, os.cpu_count())
    )

    updater = ModelUpdater(
        original_model_path=args.original_model,
        class_info_path=args.class_info,
        model_name=args.model
    )

    model = updater.create_updated_model(dataset.class_names)

    if not args.retrain_all:
        logging.info("Freezing feature extractor layers (only training classifier)")
        for name, param in model.named_parameters():
            if 'classifier' not in name and 'fc' not in name:
                param.requires_grad = False

    trained_model, val_acc = updater.train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        learning_rate=args.lr,
        epochs=args.epochs,
        use_class_weights=not args.no_class_weights
    )

    model_path, class_info_path = save_model_with_class_info(
        model=trained_model,
        class_names=dataset.class_names,
        output_dir=args.output_dir
    )

    elapsed_time = time.time() - start_time
    logging.info(f"Model retraining completed in {elapsed_time // 60:.0f}m {elapsed_time % 60:.0f}s")
    logging.info(f"Final validation accuracy: {val_acc:.2f}%")
    logging.info(f"Retrained model saved to {model_path}")
    logging.info(f"Updated class info saved to {class_info_path}")


if __name__ == "__main__":
    main()
