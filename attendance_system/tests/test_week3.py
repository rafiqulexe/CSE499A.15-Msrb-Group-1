"""Week 3 placeholder tests for attendance logging."""

from utils.attendance import mark_attendance, get_attendance_records


def test_mark_attendance():
    mark_attendance("S001")
    records = get_attendance_records()
    assert any(r["student_id"] == "S001" for r in records)
