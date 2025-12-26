import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, Subset
from torchvision import transforms, models
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay
import numpy as np
import matplotlib
from matplotlib import pyplot as plt
import os
import pathlib
from PIL import Image
import logging
import json
import time
from torch.optim.lr_scheduler import ReduceLROnPlateau
from tqdm import tqdm
import math
import argparse
import wandb
import threading
import torch.serialization
import asyncio
import aiofiles
from concurrent.futures import ThreadPoolExecutor
import io

matplotlib.use("Agg")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("training.log"),
        logging.StreamHandler()
    ]
)

def set_seed(seed=42):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


set_seed()

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
                transforms.RandomResizedCrop(resolution),
                transforms.RandomHorizontalFlip(),
                transforms.RandomVerticalFlip(p=0.2),
                transforms.RandomRotation(20),
                transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
                transforms.RandomAffine(degrees=0, translate=(0.1, 0.1)),
                transforms.ToTensor(),
                normalize
            ])
        else:
            return transforms.Compose([
                transforms.Resize((resolution, resolution)),
                transforms.ToTensor(),
                normalize
            ])


class ImageClassificationDataset(Dataset):
    def __init__(self, root_dir, transform=None, img_size=224, transform_on_cpu=False):
        self.root_dir = pathlib.Path(root_dir)
        self.transform = transform
        self.img_size = img_size
        self.class_names = sorted([d.name for d in self.root_dir.iterdir() if d.is_dir()])
        self.num_classes = len(self.class_names)
        self.samples = []
        self.transform_on_cpu = transform_on_cpu

        for class_idx, class_name in enumerate(self.class_names):
            class_dir = self.root_dir / class_name
            for img_path in class_dir.glob('*.*'):
                if img_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                    self.samples.append((str(img_path), class_idx))

        logging.info(f"Found {len(self.samples)} images across {self.num_classes} classes")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        try:
            with Image.open(img_path) as img:
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


class AsyncPrefetcher:
    def __init__(self, loader):
        self.loader = loader
        self.stream = torch.cuda.Stream()
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.loop = asyncio.get_event_loop()
        self.next_input = None
        self.next_target = None
        self._preload_task = None
        self._iterator = iter(loader)
        self.preload()

    async def _async_preload(self):
        try:
            batch = await self.loop.run_in_executor(
                self.executor, next, self._iterator, None
            )
            if batch is None:
                return None, None

            inputs, targets = batch
            if inputs is not None:
                with torch.cuda.stream(self.stream):
                    inputs = inputs.cuda(non_blocking=True)
                    targets = targets.cuda(non_blocking=True)
                return inputs, targets
            return None, None
        except StopIteration:
            return None, None
        except Exception as e:
            logging.error(f"Error in prefetching: {e}")
            return None, None

    def preload(self):
        self._preload_task = asyncio.create_task(self._async_preload())

    async def next(self):
        await self._preload_task
        inputs, targets = self._preload_task.result()
        if inputs is not None:
            self.preload()
        return inputs, targets

    def __len__(self):
        return len(self.loader)


def create_stratified_splits(dataset, val_size=0.15, test_size=0.15):
    indices = np.arange(len(dataset))
    labels = np.array([dataset.samples[i][1] for i in range(len(dataset))])

    train_val_idx, test_idx = train_test_split(
        indices, test_size=test_size, stratify=labels, random_state=42
    )

    train_labels = labels[train_val_idx]
    train_idx, val_idx = train_test_split(
        train_val_idx, test_size=val_size / (1 - test_size), stratify=train_labels, random_state=42
    )

    class_distribution = dataset.get_class_distribution()
    logging.info(f"Class distribution: {class_distribution}")
    logging.info(f"Train set: {len(train_idx)} samples")
    logging.info(f"Validation set: {len(val_idx)} samples")
    logging.info(f"Test set: {len(test_idx)} samples")

    return Subset(dataset, train_idx), Subset(dataset, val_idx), Subset(dataset, test_idx)


def calculate_class_weights(dataset):
    if isinstance(dataset, Subset):
        original_dataset = dataset.dataset
        indices = dataset.indices
        labels = [original_dataset.samples[i][1] for i in indices]
    else:
        labels = [sample[1] for sample in dataset.samples]

    class_counts = np.bincount(labels)
    class_weights = 1.0 / class_counts
    normalized_weights = class_weights / class_weights.sum() * len(class_counts)

    logging.info(f"Class weights: {normalized_weights}")
    return torch.tensor(normalized_weights, dtype=torch.float32).to(device)


class FPNModel(nn.Module):
    def __init__(self, backbone, num_classes, dropout=0.3):
        super(FPNModel, self).__init__()
        self.backbone = backbone
        self.num_classes = num_classes
        self.dropout = dropout

        self.feature_indices, self.backbone_out_channels = self.inspect_backbone_channels()

        self.fpn = nn.ModuleList()
        for channels in self.backbone_out_channels:
            self.fpn.append(nn.Sequential(
                nn.Conv2d(channels, 256, kernel_size=1),
                nn.BatchNorm2d(256),
                nn.ReLU(inplace=True)
            ))

        self.lateral_conv = nn.ModuleList()
        for _ in range(len(self.backbone_out_channels) - 1):
            self.lateral_conv.append(nn.Sequential(
                nn.Conv2d(256, 256, kernel_size=3, padding=1),
                nn.BatchNorm2d(256),
                nn.ReLU(inplace=True)
            ))

        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(256, num_classes)
        )

    def inspect_backbone_channels(self):
        self.backbone = self.backbone.to(device)
        dummy_input = torch.randn(1, 3, 224, 224).to(device)

        feature_indices = []
        backbone_out_channels = []

        if hasattr(self.backbone, 'features'):
            x = dummy_input
            features = []

            blocks = list(self.backbone.features.children())

            total_blocks = len(blocks)
            sampling_indices = [
                total_blocks // 4,
                total_blocks // 2,
                3 * total_blocks // 4,
                total_blocks - 1
            ]

            for i, block in enumerate(blocks):
                x = block(x)
                if i in sampling_indices:
                    feature_indices.append(i)
                    backbone_out_channels.append(x.size(1))

            if len(feature_indices) > 4:
                feature_indices = feature_indices[-4:]
                backbone_out_channels = backbone_out_channels[-4:]
            elif len(feature_indices) < 4:
                while len(feature_indices) < 4:
                    feature_indices.append(feature_indices[-1])
                    backbone_out_channels.append(backbone_out_channels[-1])

        elif hasattr(self.backbone, 'layer1'):
            x = self.backbone.conv1(dummy_input)
            x = self.backbone.bn1(x)
            x = self.backbone.relu(x)
            x = self.backbone.maxpool(x)

            c1 = self.backbone.layer1(x)
            c2 = self.backbone.layer2(c1)
            c3 = self.backbone.layer3(c2)
            c4 = self.backbone.layer4(c3)

            feature_indices = [1, 2, 3, 4]
            backbone_out_channels = [c1.size(1), c2.size(1), c3.size(1), c4.size(1)]

        elif hasattr(self.backbone, 'features'):
            x = dummy_input
            features = []
            blocks = list(self.backbone.features.children())
            total_blocks = len(blocks)
            sampling_indices = [
                total_blocks // 4,
                total_blocks // 2,
                3 * total_blocks // 4,
                total_blocks - 1
            ]

            for i, block in enumerate(blocks):
                x = block(x)
                if i in sampling_indices:
                    feature_indices.append(i)
                    backbone_out_channels.append(x.size(1))

            if len(feature_indices) > 4:
                feature_indices = feature_indices[-4:]
                backbone_out_channels = backbone_out_channels[-4:]
            elif len(feature_indices) < 4:
                while len(feature_indices) < 4:
                    feature_indices.append(feature_indices[-1])
                    backbone_out_channels.append(backbone_out_channels[-1])

        logging.info(f"Feature indices: {feature_indices}")
        logging.info(f"Backbone out channels: {backbone_out_channels}")
        return feature_indices, backbone_out_channels

    def forward_features(self, x):
        features = []

        if hasattr(self.backbone, 'features'):
            x = self.backbone.features[0](x)
            for i, layer in enumerate(self.backbone.features[1:], start=1):
                x = layer(x)
                if i in self.feature_indices:
                    features.append(x)

        elif hasattr(self.backbone, 'layer1'):
            x = self.backbone.conv1(x)
            x = self.backbone.bn1(x)
            x = self.backbone.relu(x)
            x = self.backbone.maxpool(x)

            c1 = self.backbone.layer1(x)
            c2 = self.backbone.layer2(c1)
            c3 = self.backbone.layer3(c2)
            c4 = self.backbone.layer4(c3)

            features = [c1, c2, c3, c4]

        elif hasattr(self.backbone, 'features'):
            x = self.backbone.features[0](x)
            for i, layer in enumerate(self.backbone.features[1:], start=1):
                x = layer(x)
                if i in self.feature_indices:
                    features.append(x)

        if len(features) > 4:
            features = features[-4:]
        elif len(features) < 4:
            while len(features) < 4:
                features.append(features[-1])

        return features

    def forward(self, x):
        features = self.forward_features(x)

        pyramid_features = []
        for feature, fpn_layer in zip(features, self.fpn):
            pyramid_features.append(fpn_layer(feature))

        merged_features = [pyramid_features[-1]]

        for i in range(len(pyramid_features) - 2, -1, -1):
            upsampled = nn.functional.interpolate(
                merged_features[0],
                size=pyramid_features[i].shape[2:],
                mode='bilinear',
                align_corners=False
            )
            merged = pyramid_features[i] + upsampled
            merged = self.lateral_conv[i](merged)
            merged_features.insert(0, merged)

        x = self.avgpool(merged_features[0])
        x = torch.flatten(x, 1)
        x = self.classifier(x)

        return x


class ModelFactory:
    @staticmethod
    def create_model(model_name, num_classes, dropout=0.3, pretrained=True, use_fpn=True):
        if model_name == 'efficientnet_v2_l':
            backbone = models.efficientnet_v2_l(weights='DEFAULT' if pretrained else None)
            if use_fpn:
                model = FPNModel(backbone, num_classes, dropout)
            else:
                num_ftrs = backbone.classifier[1].in_features
                backbone.classifier = nn.Sequential(
                    nn.Dropout(dropout),
                    nn.Linear(num_ftrs, num_classes))
                model = backbone
        elif model_name == 'efficientnet_v2_s':
            backbone = models.efficientnet_v2_s(weights='DEFAULT' if pretrained else None)
            if use_fpn:
                model = FPNModel(backbone, num_classes, dropout)
            else:
                num_ftrs = backbone.classifier[1].in_features
                backbone.classifier = nn.Sequential(
                    nn.Dropout(dropout),
                    nn.Linear(num_ftrs, num_classes))
                model = backbone
        elif model_name == 'resnet50':
            backbone = models.resnet50(weights='DEFAULT' if pretrained else None)
            if use_fpn:
                model = FPNModel(backbone, num_classes, dropout)
            else:
                num_ftrs = backbone.fc.in_features
                backbone.fc = nn.Sequential(
                    nn.Dropout(dropout),
                    nn.Linear(num_ftrs, num_classes))
                model = backbone
        elif model_name == 'mobilenet_v3_large':
            backbone = models.mobilenet_v3_large(weights='DEFAULT' if pretrained else None)
            if use_fpn:
                model = FPNModel(backbone, num_classes, dropout)
            else:
                num_ftrs = backbone.classifier[3].in_features
                backbone.classifier[3] = nn.Linear(num_ftrs, num_classes)
                model = backbone
        else:
            raise ValueError(f"Model {model_name} not supported")

        return model.to(device)


async def async_validate_model(model, val_loader, criterion, use_mixed_precision=True):
    model.eval()
    all_preds = []
    all_targets = []
    running_loss = 0.0

    with torch.no_grad():
        batch_pbar = tqdm(val_loader, desc="Validation")
        for inputs, labels in batch_pbar:
            inputs, labels = inputs.to(device), labels.to(device)

            if use_mixed_precision:
                with torch.amp.autocast(device_type='cuda'):
                    outputs = model(inputs)
                    loss = criterion(outputs, labels)
            else:
                outputs = model(inputs)
                loss = criterion(outputs, labels)

            running_loss += loss.item()
            _, predicted = outputs.max(1)
            all_preds.extend(predicted.cpu().numpy())
            all_targets.extend(labels.cpu().numpy())

            await asyncio.sleep(0)

    val_loss = running_loss / len(val_loader)
    val_acc = 100. * np.mean(np.array(all_preds) == np.array(all_targets))

    return val_loss, val_acc


async def async_train_epoch(model, train_loader, criterion, optimizer,
                            scaler, epoch, num_epochs, config):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    nan_detected = False

    prefetcher = AsyncPrefetcher(train_loader)
    inputs, labels = await prefetcher.next()
    batch_idx = 0

    train_pbar = tqdm(total=len(train_loader),
                      desc=f"Epoch {epoch + 1}/{num_epochs} [Train]",
                      mininterval=1.0)

    while inputs is not None and not nan_detected:
        optimizer.zero_grad()

        if config.use_mixed_precision:
            with torch.amp.autocast(device_type='cuda'):
                outputs = model(inputs)
                loss = criterion(outputs, labels)

            if torch.isnan(loss).any():
                logging.warning("NaN detected in loss, skipping batch")
                nan_detected = True
                inputs, labels = await prefetcher.next()
                continue

            scaler.scale(loss).backward()
            if hasattr(config, 'grad_clip') and config.grad_clip > 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), config.grad_clip)
            scaler.step(optimizer)
            scaler.update()
        else:
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            if torch.isnan(loss).any():
                logging.warning("NaN detected in loss, skipping batch")
                nan_detected = True
                inputs, labels = await prefetcher.next()
                continue

            loss.backward()
            if hasattr(config, 'grad_clip') and config.grad_clip > 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), config.grad_clip)
            optimizer.step()

        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

        batch_idx += 1
        train_pbar.update(1)
        train_pbar.set_postfix({
            'loss': running_loss / batch_idx,
            'acc': 100. * correct / total
        })

        inputs, labels = await prefetcher.next()
        await asyncio.sleep(0)

    train_pbar.close()

    if nan_detected:
        return float('inf'), 0.0

    train_loss = running_loss / len(train_loader)
    train_acc = 100. * correct / total

    return train_loss, train_acc


async def async_train_model(model, train_loader, val_loader, criterion, optimizer,
                            scheduler=None, num_epochs=20, early_stopping_patience=6,
                            config=None):
    start_time = time.time()
    history = {
        'loss': [], 'val_loss': [],
        'accuracy': [], 'val_accuracy': []
    }

    best_val_loss = float('inf')
    patience_counter = 0
    scaler = torch.amp.GradScaler() if config.use_mixed_precision else None

    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True

    for epoch in range(num_epochs):
        train_loss, train_acc = await async_train_epoch(
            model, train_loader, criterion, optimizer,
            scaler, epoch, num_epochs, config
        )

        if math.isnan(train_loss):
            logging.error("NaN loss detected during training. Stopping training.")
            break

        val_loss, val_acc = await async_validate_model(
            model, val_loader, criterion, config.use_mixed_precision
        )

        if math.isnan(val_loss):
            logging.error("NaN loss detected during validation. Stopping training.")
            break

        if scheduler is not None:
            old_lr = optimizer.param_groups[0]['lr']
            scheduler.step(val_loss)
            new_lr = optimizer.param_groups[0]['lr']
            if new_lr != old_lr:
                logging.info(f'Learning rate reduced from {old_lr} to {new_lr}')

        history['loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['accuracy'].append(train_acc)
        history['val_accuracy'].append(val_acc)

        logging.info(f'Epoch {epoch + 1}/{num_epochs}, '
                     f'Loss: {train_loss:.4f}, Acc: {train_acc:.2f}%, '
                     f'Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%')

        if wandb.run is not None:
            wandb.log({
                "train_loss": train_loss,
                "train_accuracy": train_acc,
                "val_loss": val_loss,
                "val_accuracy": val_acc,
                "learning_rate": optimizer.param_groups[0]['lr']
            })

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            model_save_path = os.path.join(config.output_dir, 'best_model.pth')

            checkpoint = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_loss': val_loss,
                'val_acc': val_acc,
            }

            buffer = io.BytesIO()
            torch.save(checkpoint, buffer)
            buffer.seek(0)

            async with aiofiles.open(model_save_path, 'wb') as f:
                await f.write(buffer.read())

            patience_counter = 0
        else:
            patience_counter += 1
            logging.info(f"No improvements for {patience_counter} epochs")

        if patience_counter >= early_stopping_patience:
            logging.info(f"Early stopping triggered after {epoch + 1} epochs")
            break

    time_elapsed = time.time() - start_time
    logging.info(f'Training completed in {time_elapsed // 60:.0f}m {time_elapsed % 60:.0f}s')

    model_path = os.path.join(config.output_dir, 'best_model.pth')
    if os.path.exists(model_path):
        logging.info(f"Loading best model from {model_path}")
        async with aiofiles.open(model_path, 'rb') as f:
            content = await f.read()
            checkpoint = torch.load(io.BytesIO(content), map_location=device, weights_only=False)
            model.load_state_dict(checkpoint['model_state_dict'])
    else:
        logging.warning(f"Best model file not found at {model_path}, using current model")

    return model, history


def evaluate_model(model, test_loader, class_names, criterion=None, use_mixed_precision=True):
    all_preds, all_targets, running_loss = predict_batch(
        model, test_loader, criterion, use_mixed_precision
    )

    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)

    report = classification_report(all_targets, all_preds, target_names=class_names)
    logging.info(f"Classification Report:\n{report}")
    cm = confusion_matrix(all_targets, all_preds)

    plt.figure(figsize=(10, 8))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=class_names)
    disp.plot(cmap=plt.cm.Blues, xticks_rotation=45)
    plt.tight_layout()
    plt.savefig('confusion_matrix.png', dpi=300)
    plt.close()

    results = {
        'classification_report': report,
        'confusion_matrix': cm,
        'accuracy': 100 * np.mean(np.array(all_preds) == np.array(all_targets))
    }

    if criterion is not None:
        results['loss'] = running_loss / len(test_loader)

    return results


def predict_batch(model, data_loader, criterion=None, use_mixed_precision=True):
    model.eval()
    all_preds = []
    all_targets = []
    running_loss = 0.0

    with torch.no_grad():
        batch_pbar = tqdm(data_loader, desc="Prediction")
        for inputs, labels in batch_pbar:
            inputs, labels = inputs.to(device), labels.to(device)

            if use_mixed_precision:
                with torch.amp.autocast(device_type='cuda'):
                    outputs = model(inputs)
                    if criterion is not None:
                        loss = criterion(outputs, labels)
                        running_loss += loss.item()
            else:
                outputs = model(inputs)
                if criterion is not None:
                    loss = criterion(outputs, labels)
                    running_loss += loss.item()

            _, predicted = outputs.max(1)
            all_preds.extend(predicted.cpu().numpy())
            all_targets.extend(labels.cpu().numpy())

            if criterion is not None:
                current_loss = running_loss / (batch_pbar.n + 1)
                current_acc = 100. * np.mean(np.array(all_preds[-len(predicted):]) ==
                                             np.array(all_targets[-len(labels):]))
                batch_pbar.set_postfix({
                    'loss': current_loss,
                    'acc': current_acc
                })

    return all_preds, all_targets, running_loss


def plot_training_history(history):
    plt.figure(figsize=(12, 5))

    plt.subplot(1, 2, 1)
    plt.plot(history['loss'], label='Train Loss')
    plt.plot(history['val_loss'], label='Validation Loss')
    plt.title('Loss over Epochs')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.legend()

    plt.subplot(1, 2, 2)
    plt.plot(history['accuracy'], label='Train Accuracy')
    plt.plot(history['val_accuracy'], label='Validation Accuracy')
    plt.title('Accuracy over Epochs')
    plt.xlabel('Epoch')
    plt.ylabel('Accuracy (%)')
    plt.legend()

    plt.tight_layout()
    plt.savefig('training_history.png', dpi=300)
    plt.close()


class Config:
    def __init__(self, **kwargs):
        self.data_dir = 'data'
        self.output_dir = 'output'
        self.model_name = 'efficientnet_v2_l'
        self.img_size = 224
        self.batch_size = 24
        self.num_workers = min(8, os.cpu_count())
        self.learning_rate = 1e-4
        self.weight_decay = 1e-4
        self.num_epochs = 20
        self.early_stopping_patience = 5
        self.dropout = 0.3
        self.val_size = 0.15
        self.test_size = 0.15
        self.use_mixed_precision = True
        self.use_class_weights = True
        self.use_scheduler = True
        self.scheduler_patience = 2
        self.scheduler_factor = 0.5
        self.use_wandb = False
        self.wandb_project = "image-classification"
        self.wandb_name = None
        self.seed = 42
        self.preprocess_on_cpu = True
        self.use_fpn = True
        self.grad_clip = 1.0

        for key, value in kwargs.items():
            setattr(self, key, value)

    def __str__(self):
        return '\n'.join(f"{key}: {value}" for key, value in self.__dict__.items())


def plot_in_background(history):
    thread = threading.Thread(target=plot_training_history, args=(history,))
    thread.start()
    return thread


async def async_main(config=None):
    if config is None:
        config = Config()

    os.makedirs(config.output_dir, exist_ok=True)

    if config.use_wandb:
        try:
            wandb.init(
                project=config.wandb_project,
                name=config.wandb_name,
                config=config.__dict__
            )
            wandb_enabled = True
        except Exception as e:
            logging.warning(f"Failed to initialize wandb: {e}")
            logging.warning("Continuing without wandb logging")
            wandb_enabled = False
    else:
        wandb_enabled = False

    set_seed(config.seed)

    logging.info(f"Creating datasets from {config.data_dir}")

    full_dataset = ImageClassificationDataset(
        root_dir=config.data_dir,
        transform=None,
        img_size=config.img_size
    )

    train_dataset, val_dataset, test_dataset = create_stratified_splits(
        full_dataset,
        val_size=config.val_size,
        test_size=config.test_size
    )

    train_dataset.dataset.transform = TransformFactory.get_transforms(
        resolution=config.img_size, mode='train'
    )
    val_dataset.dataset.transform = TransformFactory.get_transforms(
        resolution=config.img_size, mode='val'
    )
    test_dataset.dataset.transform = TransformFactory.get_transforms(
        resolution=config.img_size, mode='test'
    )

    if hasattr(config, 'preprocess_on_cpu') and config.preprocess_on_cpu:
        train_dataset.dataset.transform_on_cpu = True
        val_dataset.dataset.transform_on_cpu = True
        test_dataset.dataset.transform_on_cpu = True

    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=config.num_workers,
        pin_memory=True,
        persistent_workers=True
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=True
    )

    test_loader = DataLoader(
        test_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=True
    )

    class_weights = None
    if config.use_class_weights:
        class_weights = calculate_class_weights(train_dataset)

    logging.info(f"Creating {config.model_name} model with {full_dataset.num_classes} classes")
    model = ModelFactory.create_model(
        model_name=config.model_name,
        num_classes=full_dataset.num_classes,
        dropout=config.dropout,
        use_fpn=config.use_fpn
    )

    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay
    )

    scheduler = None
    if config.use_scheduler:
        scheduler = ReduceLROnPlateau(
            optimizer,
            mode='min',
            factor=config.scheduler_factor,
            patience=config.scheduler_patience
        )

    config_path = os.path.join(config.output_dir, 'config.json')
    with open(config_path, 'w') as f:
        json.dump(config.__dict__, f, indent=4)

    class_info = {
        'class_names': full_dataset.class_names,
        'num_classes': full_dataset.num_classes
    }
    class_info_path = os.path.join(config.output_dir, 'class_info.json')
    with open(class_info_path, 'w') as f:
        json.dump(class_info, f, indent=4)

    logging.info("Starting model training")
    model, history = await async_train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        criterion=criterion,
        optimizer=optimizer,
        scheduler=scheduler,
        num_epochs=config.num_epochs,
        early_stopping_patience=config.early_stopping_patience,
        config=config
    )

    plot_thread = plot_in_background(history)

    logging.info("Evaluating model on test set")
    eval_results = evaluate_model(
        model=model,
        test_loader=test_loader,
        class_names=full_dataset.class_names,
        use_mixed_precision=config.use_mixed_precision
    )

    plot_thread.join()

    eval_results_path = os.path.join(config.output_dir, 'evaluation_results.json')
    with open(eval_results_path, 'w') as f:
        serializable_results = {
            'classification_report': eval_results['classification_report'],
            'confusion_matrix': eval_results['confusion_matrix'].tolist(),
            'accuracy': float(eval_results['accuracy'])
        }
        json.dump(serializable_results, f, indent=4)

    if config.use_wandb and wandb_enabled:
        wandb.log({
            "test_accuracy": eval_results['accuracy'],
            "confusion_matrix": wandb.Image('confusion_matrix.png'),
            "training_history": wandb.Image('training_history.png')
        })
        wandb.finish()

    logging.info(f"Model training and evaluation completed. Results saved to {config.output_dir}")
    return eval_results['accuracy']


class ImagePredictor:
    def __init__(self, model_path, class_info_path, img_size=224):
        with open(class_info_path, 'r') as f:
            class_info = json.load(f)

        self.class_names = class_info['class_names']
        self.num_classes = class_info['num_classes']
        self.img_size = img_size

        config_path = os.path.join(os.path.dirname(model_path), 'config.json')
        with open(config_path, 'r') as f:
            config = json.load(f)

        model_name = config.get('model_name', 'efficientnet_v2_l')
        use_fpn = config.get('use_fpn', True)

        self.model = ModelFactory.create_model(
            model_name=model_name,
            num_classes=self.num_classes,
            pretrained=False,
            use_fpn=use_fpn
        )

        checkpoint = torch.load(model_path, map_location=device, weights_only=False)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()

        self.transform = TransformFactory.get_transforms(
            resolution=self.img_size, mode='test'
        )

    def predict(self, image_path, top_k=3):
        try:
            with Image.open(image_path) as img:
                img = img.convert('RGB')
                img_tensor = self.transform(img).unsqueeze(0).to(device)

            with torch.no_grad():
                with torch.amp.autocast(device_type='cuda'):
                    outputs = self.model(img_tensor)

                probs = torch.nn.functional.softmax(outputs, dim=1)[0]

                top_probs, top_indices = torch.topk(probs, min(top_k, len(self.class_names)))

                results = []
                for i, (prob, idx) in enumerate(zip(top_probs.cpu().numpy(), top_indices.cpu().numpy())):
                    results.append({
                        'rank': i + 1,
                        'class_name': self.class_names[idx],
                        'class_id': int(idx),
                        'probability': float(prob)
                    })

                return results

        except Exception as e:
            logging.error(f"Error predicting image {image_path}: {e}")
            return []


def batch_predict(predictor, image_dir, output_file=None, top_k=3):
    results = {}
    image_paths = pathlib.Path(image_dir).glob('*.*')

    for img_path in tqdm(list(image_paths), desc="Predicting images"):
        if img_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
            preds = predictor.predict(str(img_path), top_k=top_k)
            if preds:
                results[img_path.name] = preds

    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=4)

    return results


def find_lr(model, train_loader, criterion, optimizer, start_lr=1e-7, end_lr=10, num_iter=100):
    if len(train_loader) * train_loader.batch_size < num_iter:
        num_iter = len(train_loader) * train_loader.batch_size

    lrs = []
    losses = []
    log_lrs = np.linspace(math.log10(start_lr), math.log10(end_lr), num_iter)

    model.train()
    for i, (inputs, labels) in enumerate(tqdm(train_loader, desc="Finding LR")):
        if i >= num_iter:
            break

        inputs, labels = inputs.to(device), labels.to(device)

        lr = 10 ** log_lrs[i]
        for param_group in optimizer.param_groups:
            param_group['lr'] = lr

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)

        loss.backward()
        optimizer.step()

        lrs.append(lr)
        losses.append(loss.item())

    plt.figure(figsize=(10, 6))
    plt.semilogx(lrs, losses)
    plt.xlabel('Learning Rate')
    plt.ylabel('Loss')
    plt.title('Learning Rate Finder')
    plt.grid(True)
    plt.savefig('lr_finder.png', dpi=300)
    plt.close()

    return lrs, losses


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train an image classification model')
    parser.add_argument('--data_dir', type=str, default='data', help='Path to data directory')
    parser.add_argument('--output_dir', type=str, default='output', help='Path to output directory')
    parser.add_argument('--model', type=str, default='efficientnet_v2_l',
                        choices=['efficientnet_v2_l', 'efficientnet_v2_s', 'resnet50', 'mobilenet_v3_large'],
                        help='Model architecture to use')
    parser.add_argument('--img_size', type=int, default=224, help='Image size for training')
    parser.add_argument('--batch_size', type=int, default=32, help='Batch size for training')
    parser.add_argument('--epochs', type=int, default=20, help='Number of epochs to train for')
    parser.add_argument('--lr', type=float, default=1e-4, help='Learning rate')
    parser.add_argument('--find_lr', action='store_true', help='Run learning rate finder')
    parser.add_argument('--use_wandb', action='store_true',
                        help='Enable wandb logging (requires wandb to be set up)')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--no_fpn', action='store_true', help='Disable Feature Pyramid Network')
    parser.add_argument('--grad_clip', type=float, default=1.0, help='Gradient clipping value')

    args = parser.parse_args()

    config = Config(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        model_name=args.model,
        img_size=args.img_size,
        batch_size=args.batch_size,
        num_epochs=args.epochs,
        learning_rate=args.lr,
        use_wandb=args.use_wandb,
        seed=args.seed,
        use_fpn=not args.no_fpn,
        grad_clip=args.grad_clip
    )

    asyncio.run(async_main(config))
