# utils/registration.py
import numpy as np
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from database.db_manager import add_student
from utils.recognition import get_face_embedding
from utils.detection import detect_faces, extract_face
from config import NUM_REGISTRATION_SAMPLES

def process_registration_sample(image):
    """
    Detects face in image and returns (embedding, error_message).
    embedding is None if detection fails.
    """
    # Detect on the original image: the YuNet detector expects unmodified
    # pixels (CLAHE pre-processing is not needed and hurts accuracy).
    faces = detect_faces(image)

    if len(faces) == 0:
        return None, "No face detected. Please ensure your face is clearly visible and looking at the camera."
    if len(faces) > 1:
        return None, f"Found {len(faces)} faces. Please upload images with only ONE face."

    face_img = extract_face(image, faces[0])
    embedding = get_face_embedding(face_img)

    if embedding is None:
        return None, "Face detected but could not generate embedding."

    return embedding, None

def finalize_registration(student_id, name, embeddings, owner_id=0):
    """
    W1-T8: Average the embeddings and store in database.
    owner_id ties the student to the account that registered it.
    """
    if not embeddings:
        return False

    avg_embedding = np.mean(embeddings, axis=0)
    return add_student(student_id, name, avg_embedding, owner_id)

