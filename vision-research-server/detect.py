"""
Object Detection using YOLOv8

Fast, real-time object detection for XR applications.
Copied from garvis/server/tools/vision/detect.py
"""
from PIL import Image

_model = None


def get_model():
    """Lazy load YOLO model"""
    global _model
    if _model is None:
        from ultralytics import YOLO
        _model = YOLO("yolov8n.pt")
        print("YOLOv8 model loaded")
    return _model


def detect_objects(
    image: Image.Image,
    confidence_threshold: float = 0.5,
    max_detections: int = 20
) -> list:
    """
    Detect objects in an image using YOLOv8.

    Returns list of dicts: [{id, class, confidence, bbox: {x1, y1, x2, y2}}]
    """
    model = get_model()
    results = model(image, conf=confidence_threshold, verbose=False)

    detections = []
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue

        for i, box in enumerate(boxes):
            if i >= max_detections:
                break

            xyxy = box.xyxy[0].tolist()
            confidence = float(box.conf[0])
            class_id = int(box.cls[0])
            class_name = model.names[class_id]

            x1, y1, x2, y2 = xyxy

            detections.append({
                "id": i,
                "class": class_name,
                "confidence": round(confidence, 3),
                "bbox": {
                    "x1": round(x1, 1),
                    "y1": round(y1, 1),
                    "x2": round(x2, 1),
                    "y2": round(y2, 1),
                }
            })

    return detections
