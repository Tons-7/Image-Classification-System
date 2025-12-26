import argparse
import torch
import json
import os
import sys
from pathlib import Path
from PIL import Image
from tqdm import tqdm
import matplotlib.pyplot as plt
from matplotlib import colors
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

sys.path.append('.')
try:
    from src.model.image_model import TransformFactory, ModelFactory, ImagePredictor
except ImportError:
    print("Error: Could not import from image_model.py. Make sure the file exists in the correct location.")
    sys.exit(1)


class EnhancedImagePredictor:

    def __init__(self, model_path, class_info_path, img_size=224):
        with open(class_info_path, 'r') as f:
            class_info = json.load(f)

        self.class_names = class_info['class_names']
        self.num_classes = class_info['num_classes']
        self.img_size = img_size
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        config_path = os.path.join(os.path.dirname(model_path), 'config.json')
        with open(config_path, 'r') as f:
            config = json.load(f)

        model_name = config.get('model_name', 'efficientnet_v2_l')
        use_fpn = config.get('use_fpn', True)

        try:
            self.model = ModelFactory.create_model(
                model_name=model_name,
                num_classes=self.num_classes,
                pretrained=False,
                use_fpn=use_fpn
            )

            checkpoint = torch.load(model_path, map_location=self.device, weights_only=False)
            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.model.eval()

            self.transform = TransformFactory.get_transforms(
                resolution=self.img_size, mode='test'
            )

            logging.info(f"Model loaded successfully with {self.num_classes} classes")
        except Exception as e:
            logging.error(f"Failed to initialize model: {e}")
            raise

    def predict(self, image_path, top_k=3):

        try:
            with Image.open(image_path) as img:
                img = img.convert('RGB')
                img_tensor = self.transform(img).unsqueeze(0).to(self.device)

            with torch.no_grad():
                outputs = self.model(img_tensor)

                if torch.isnan(outputs).any():
                    logging.warning(f"NaN values detected in model outputs for {image_path}")

                    outputs = torch.nan_to_num(outputs, nan=-1e9)

                probs = torch.nn.functional.softmax(outputs, dim=1)[0]

                if torch.isnan(probs).any():
                    logging.warning(f"NaN values detected in probabilities for {image_path}")
                    probs = torch.nan_to_num(probs, nan=0.0)

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
            return None


def load_predictor(model_dir):
    model_path = os.path.join(model_dir, 'best_model.pth')
    class_info_path = os.path.join(model_dir, 'class_info.json')

    if not os.path.exists(model_path):
        print(f"Error: Model file not found at {model_path}")
        sys.exit(1)

    if not os.path.exists(class_info_path):
        print(f"Error: Class info not found at {class_info_path}")
        sys.exit(1)

    try:
        config_path = os.path.join(model_dir, 'config.json')
        with open(config_path, 'r') as f:
            config = json.load(f)
        img_size = config.get('img_size', 224)

        return EnhancedImagePredictor(model_path, class_info_path, img_size=img_size)
    except Exception as e:
        print(f"Error loading model: {e}")
        sys.exit(1)


def predict_image(predictor, image_path, top_k=3, visualize=False):
    results = predictor.predict(image_path, top_k=top_k)

    if results is None:
        print(f"Failed to predict {image_path}")
        return

    print(f"\nPredictions for {os.path.basename(image_path)}:")
    for i, pred in enumerate(results):
        print(f"{i + 1}. {pred['class_name']} - {pred['probability']:.4f} ({pred['probability'] * 100:.2f}%)")

    if visualize:
        try:
            img = Image.open(image_path).convert('RGB')
            plt.figure(figsize=(8, 8))
            plt.imshow(img)

            title = "\n".join([f"{i + 1}. {r['class_name']} ({r['probability'] * 100:.2f}%)"
                               for i, r in enumerate(results[:3])])

            plt.title(title, fontsize=14)
            plt.axis('off')

            viz_path = f"{os.path.splitext(image_path)[0]}_prediction.jpg"
            plt.savefig(viz_path, bbox_inches='tight', dpi=150)
            plt.close()
            print(f"Visualization saved to {viz_path}")
        except Exception as e:
            print(f"Visualization error: {e}")


def predict_folder(predictor, folder_path, top_k=3, output_file=None, visualize=False):
    if not os.path.isdir(folder_path):
        print(f"Error: {folder_path} is not a directory")
        return

    extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    image_paths = []
    for ext in extensions:
        image_paths.extend(list(Path(folder_path).glob(f'*{ext}')))
        image_paths.extend(list(Path(folder_path).glob(f'*{ext.upper()}')))

    if not image_paths:
        print(f"No images found in {folder_path}")
        return

    results = {}
    for img_path in tqdm(image_paths, desc="Predicting images"):
        preds = predictor.predict(str(img_path), top_k=top_k)
        if preds:
            results[img_path.name] = preds

            if visualize:
                try:
                    img = Image.open(img_path).convert('RGB')
                    plt.figure(figsize=(8, 8))
                    plt.imshow(img)

                    title = "\n".join([f"{i + 1}. {r['class_name']} ({r['probability'] * 100:.2f}%)"
                                       for i, r in enumerate(preds[:3])])

                    plt.title(title, fontsize=14)
                    plt.axis('off')

                    viz_path = f"{os.path.splitext(str(img_path))[0]}_prediction.jpg"
                    plt.savefig(viz_path, bbox_inches='tight', dpi=150)
                    plt.close()
                except Exception as e:
                    print(f"Visualization error for {img_path}: {e}")

    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=4)
        print(f"Results saved to {output_file}")

    return results


def create_summary_visualization(results, output_path='prediction_summary.png'):
    if not results:
        print("No results to visualize")
        return

    top_classes = {}
    for img_name, preds in results.items():
        if preds and len(preds) > 0:
            top_class = preds[0]['class_name']
            if top_class in top_classes:
                top_classes[top_class] += 1
            else:
                top_classes[top_class] = 1

    sorted_classes = sorted(top_classes.items(), key=lambda x: x[1], reverse=True)

    plt.figure(figsize=(12, 8))
    classes = [c[0] for c in sorted_classes]
    frequencies = [c[1] for c in sorted_classes]

    cmap = plt.cm.viridis
    norm = colors.Normalize(vmin=min(frequencies), vmax=max(frequencies))

    bars = plt.bar(classes, frequencies, color=cmap(norm(frequencies)))
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.title("Distribution of Top Predictions", fontsize=16)
    plt.xlabel("Class", fontsize=14)
    plt.ylabel("Count", fontsize=14)

    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width() / 2., height + 0.1,
                 f'{int(height)}', ha='center', va='bottom')

    plt.savefig(output_path, bbox_inches='tight', dpi=150)
    plt.close()
    print(f"Summary visualization saved to {output_path}")


def check_model_issues(model_dir):
    model_path = os.path.join(model_dir, 'best_model.pth')

    try:

        checkpoint = torch.load(model_path, map_location='cpu', weights_only=False)

        expected_keys = ['model_state_dict', 'optimizer_state_dict', 'val_loss', 'val_acc']
        missing_keys = [key for key in expected_keys if key not in checkpoint]

        if missing_keys:
            print(f"Warning: Model checkpoint is missing expected keys: {missing_keys}")

        if 'model_state_dict' in checkpoint:
            nan_params = []
            for name, param in checkpoint['model_state_dict'].items():
                if torch.isnan(param).any():
                    nan_params.append(name)

            if nan_params:
                print(f"Warning: NaN values found in model parameters: {nan_params}")
                return False

        return True
    except Exception as e:
        print(f"Error checking model: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Make predictions with trained model')
    parser.add_argument('--model_dir', type=str, required=True,
                        help='Directory containing the trained model')
    parser.add_argument('--image', type=str, default=None,
                        help='Path to a single image to predict')
    parser.add_argument('--folder', type=str, default=None,
                        help='Path to a folder of images to predict')
    parser.add_argument('--top_k', type=int, default=3,
                        help='Number of top predictions to show')
    parser.add_argument('--output', type=str, default=None,
                        help='Output JSON file for batch predictions')
    parser.add_argument('--visualize', action='store_true',
                        help='Create visualizations of predictions')
    parser.add_argument('--debug', action='store_true',
                        help='Run additional model diagnostics')

    args = parser.parse_args()

    if not args.image and not args.folder:
        parser.error("Either --image or --folder must be specified")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if args.debug:
        print("Running model diagnostics...")
        check_model_issues(args.model_dir)

    predictor = load_predictor(args.model_dir)

    if args.image:
        if not os.path.isfile(args.image):
            print(f"Error: Image file {args.image} not found")
        else:
            predict_image(predictor, args.image, args.top_k, args.visualize)

    if args.folder:
        print(f"Processing images in {args.folder}...")
        folder_results = predict_folder(predictor, args.folder, args.top_k, args.output, args.visualize)

        if folder_results and args.visualize:
            create_summary_visualization(folder_results)


if __name__ == "__main__":
    main()
