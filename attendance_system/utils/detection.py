# utils/detection.py - Face Detection Module
import cv2
import numpy as np
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

# YuNet CNN detector (bundled at models/yunet.onnx). Far more reliable than the
# old Haar cascade on uploaded photos: handles tilted heads, glasses, and
# uneven lighting without producing false positives. Available in OpenCV >= 4.7
# (including 5.x, where CascadeClassifier was removed).
YUNET_MODEL_PATH = os.path.join(parent_dir, 'models', 'yunet.onnx')
YUNET_SCORE_THRESHOLD = 0.6

def _detect_with_yunet(image, min_w, min_h):
    """Run the YuNet detector. Returns box list, or None if unavailable."""
    if not os.path.exists(YUNET_MODEL_PATH):
        return None
    if not hasattr(cv2, 'FaceDetectorYN_create'):
        return None  # OpenCV too old for YuNet

    height, width = image.shape[:2]
    detector = cv2.FaceDetectorYN_create(
        YUNET_MODEL_PATH, "", (width, height),
        score_threshold=YUNET_SCORE_THRESHOLD,
    )
    _, detections = detector.detect(image)
    if detections is None:
        return []

    faces = []
    for det in detections:
        x, y, w, h, score = int(det[0]), int(det[1]), int(det[2]), int(det[3]), float(det[-1])
        if w >= min_w and h >= min_h:
            faces.append(((x, y, w, h), score))
    # Most confident detections first so callers can use faces[0] safely
    faces.sort(key=lambda f: (f[1], f[0][2] * f[0][3]), reverse=True)
    return [box for box, _ in faces]

def _detect_with_haar(image, min_w, min_h):
    """Haar cascade fallback for OpenCV versions without FaceDetectorYN."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    local_cascade = os.path.join(parent_dir, 'models', 'cascades', 'haarcascade_frontalface_default.xml')
    if os.path.exists(local_cascade):
        cascade_path = local_cascade
    elif hasattr(cv2, 'CascadeClassifier'):
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    else:
        return []

    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        print(f"ERROR: Could not load cascade classifier from {cascade_path}")
        return []

    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_w, min_h)
    )
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]

def detect_faces(image, min_face_size=(30, 30)):
    """Detect all faces, return [(x, y, w, h), ...]"""
    if isinstance(image, str):
        image = cv2.imread(image)
        if image is None:
            raise ValueError(f"Could not load image: {image}")

    if image.size == 0:
        return []

    min_w, min_h = min_face_size
    faces = _detect_with_yunet(image, min_w, min_h)
    if faces is None:
        faces = _detect_with_haar(image, min_w, min_h)
    return faces

def draw_face_boxes(image, face_boxes, labels=None, color=(0, 255, 0)):
    """Draw bounding boxes and labels on detected faces"""
    result = image.copy()
    for i, (x, y, w, h) in enumerate(face_boxes):
        cv2.rectangle(result, (x, y), (x + w, y + h), color, 2)
        if labels and i < len(labels):
            label = str(labels[i])
            (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(result, (x, y - text_h - 10), (x + text_w, y), color, -1)
            cv2.putText(result, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return result

def extract_face(image, face_box, padding=0.2):
    """Extract a single face from image given bounding box"""
    x, y, w, h = face_box
    pad_x = int(w * padding)
    pad_y = int(h * padding)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(image.shape[1], x + w + pad_x)
    y2 = min(image.shape[0], y + h + pad_y)
    return image[y1:y2, x1:x2]
