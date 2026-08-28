"""Wrapper around face recognition functionality."""

import numpy as np

from utils.recognition import get_face_embedding, recognize_face


class FaceModel:
    """Simple wrapper for face embedding and recognition."""

    def __init__(self):
        self.last_embedding = None

    def encode(self, image):
        embedding = get_face_embedding(image)
        self.last_embedding = embedding
        return embedding

    def recognize(self, image, known_students, threshold=0.6):
        embedding = self.encode(image)
        if embedding is None:
            return {"student_id": "UNKNOWN", "name": "Unknown", "distance": None, "match": False}
        return recognize_face(embedding, known_students, threshold=threshold)
