# utils/image_processing.py - Image Preprocessing Utilities
import cv2
import numpy as np

def resize_image(image, max_width=1280):
    """Resize image while maintaining aspect ratio"""
    h, w = image.shape[:2]
    if w > max_width:
        ratio = max_width / w
        return cv2.resize(image, (max_width, int(h * ratio)))
    return image

def normalize_lighting(image):
    """Normalize lighting using CLAHE"""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

def preprocess_for_detection(image):
    """Full preprocessing pipeline"""
    return normalize_lighting(resize_image(image))