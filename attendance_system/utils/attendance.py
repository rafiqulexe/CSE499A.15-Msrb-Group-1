"""Attendance marking and reporting utilities."""

import csv
import os
from datetime import datetime
import cv2
import numpy as np

from database.db_manager import get_connection, get_all_students
from utils.detection import detect_faces, draw_face_boxes, extract_face
from utils.recognition import get_face_embedding, recognize_face
from config import UNKNOWN_DIR

# Per-owner cache of student embeddings to improve performance (W5-T6).
# Key None holds the legacy global view used by the tests.
_known_students_cache = {}

def get_cached_students(force_refresh=False, owner_id=None):
    cached = _known_students_cache.get(owner_id)
    if cached is None or force_refresh:
        cached = get_all_students(owner_id)
        _known_students_cache[owner_id] = cached
    return cached


def mark_attendance(student_id, status="Present", attendance_date=None, owner_id=0):
    """Insert or update attendance for a student for a given date."""
    if attendance_date is None:
        attendance_date = datetime.now().strftime("%Y-%m-%d")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO attendance (student_id, owner_id, date, status, timestamp) VALUES (?, ?, ?, ?, ?)",
            (student_id, owner_id, attendance_date, status, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return True
    except Exception as exc:
        print(f"Error marking attendance: {exc}")
        return False
    finally:
        conn.close()


def get_attendance_records(attendance_date=None, owner_id=None):
    """Fetch attendance rows for a specific date (optionally per owner)."""
    if attendance_date is None:
        attendance_date = datetime.now().strftime("%Y-%m-%d")

    conn = get_connection()
    cursor = conn.cursor()
    if owner_id is None:
        cursor.execute(
            "SELECT student_id, date, status, timestamp FROM attendance WHERE date = ? ORDER BY timestamp",
            (attendance_date,),
        )
    else:
        cursor.execute(
            "SELECT student_id, date, status, timestamp FROM attendance WHERE date = ? AND owner_id = ? ORDER BY timestamp",
            (attendance_date, owner_id),
        )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_attendance_records_detailed(attendance_date=None, owner_id=None):
    """Fetch attendance rows for a date, joined with student names."""
    if attendance_date is None:
        attendance_date = datetime.now().strftime("%Y-%m-%d")

    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT a.student_id, s.name, a.date, a.status, a.timestamp
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.student_id AND a.owner_id = s.owner_id
        WHERE a.date = ?
    """
    params = [attendance_date]
    if owner_id is not None:
        query += " AND a.owner_id = ?"
        params.append(owner_id)
    query += " ORDER BY a.timestamp"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def export_attendance_report(output_path, attendance_date=None):
    """Export attendance records to CSV."""
    records = get_attendance_records(attendance_date)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["student_id", "date", "status", "timestamp"])
        writer.writeheader()
        writer.writerows(records)

    return output_path


def process_attendance_image(image, owner_id=None):
    """
    W3-T1: Full pipeline to detect, recognize and mark attendance from an image.
    owner_id scopes recognition and marking to one account's students.
    Returns: (processed_image, list_of_matches)
    """
    # 1. Detect faces
    face_boxes = detect_faces(image)
    if not face_boxes:
        return image, []

    # 2. Get known students (Cached for performance W5-T6)
    known_students = get_cached_students(owner_id=owner_id)

    matches = []
    labels = []

    # 3. Process each face
    for i, box in enumerate(face_boxes):
        face_img = extract_face(image, box)
        embedding = get_face_embedding(face_img)

        if embedding is not None:
            res = recognize_face(embedding, known_students)
            matches.append(res)

            if res['match']:
                # 4. Mark attendance in DB
                mark_attendance(res['student_id'], owner_id=owner_id or 0)
                labels.append(f"{res['name']} ({res['distance']})")
            else:
                # W5-T7: Handle "Unknown" faces – log them for manual review
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                unknown_path = os.path.join(UNKNOWN_DIR, f"unknown_{timestamp}_{i}.jpg")
                cv2.imwrite(unknown_path, face_img)

                labels.append(f"Unknown ({res['distance']})")
        else:
            labels.append("Processing Error")
            matches.append({'student_id': 'ERROR', 'name': 'Error', 'match': False})

    # 5. Draw results
    processed_image = draw_face_boxes(image, face_boxes, labels)

    return processed_image, matches
