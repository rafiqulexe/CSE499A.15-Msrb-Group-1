import sys
import os
import numpy as np
import cv2

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import init_database, get_all_students, delete_student, add_student
from utils.attendance import process_attendance_image
from utils.registration import finalize_registration
from config import FACE_ENCODING_DIM

def test_registration_logic():
    print("Testing registration logic...")
    sid, name = "TEST_ID_001", "Test Student"
    delete_student(sid) # Cleanup if exists

    # Create mock embeddings
    mock_embeddings = [np.random.rand(FACE_ENCODING_DIM) for _ in range(5)]
    success = finalize_registration(sid, name, mock_embeddings)
    assert success, "Registration failed"

    students = get_all_students()
    match = next((s for s in students if s['student_id'] == sid), None)
    assert match is not None, "Student not found in DB"
    assert match['name'] == name
    assert len(match['embedding']) == FACE_ENCODING_DIM

    print("✓ Registration logic passed")
    return match

def test_attendance_pipeline_empty():
    print("Testing attendance pipeline with empty image...")
    # Create a blank image
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    processed_img, matches = process_attendance_image(img)

    assert len(matches) == 0, "Should find no faces in blank image"
    assert processed_img.shape == img.shape

    print("✓ Attendance pipeline empty image passed")

if __name__ == "__main__":
    init_database()
    try:
        test_registration_logic()
        test_attendance_pipeline_empty()
        print("\nALL NON-INTERACTIVE TESTS PASSED!")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
