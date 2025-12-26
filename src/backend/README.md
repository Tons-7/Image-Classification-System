# Image Classification Backend

This is a simple Flask backend server for the Image Classification application.

## Setup

1. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

1. Make sure you're in the backend directory
2. Run the Flask application:
```bash
python app.py
```

The server will start on http://localhost:5001

## API Endpoints

- `GET /api/classes` - Get list of supported classes and model info
- `GET /api/config` - Get configuration (contact email)
- `POST /api/contact` - Submit contact form
- `POST /api/predict` - Classify a single image
- `POST /api/predict-batch` - Classify multiple images
- `POST /api/attention-map` - Generate attention map for an image

## Note

This is a mock backend that returns predefined responses. In a production environment, you would:
1. Implement actual image classification
2. Add proper error handling
3. Implement security measures
4. Add database integration
5. Add proper logging 