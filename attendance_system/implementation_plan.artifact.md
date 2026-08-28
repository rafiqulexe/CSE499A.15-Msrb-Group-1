# Implementation Plan - System Fixes and Features

This plan addresses the missing features and fixes required according to the project timeline (Excel file) and the current state of the codebase.

## User Review Required

> [!IMPORTANT]
> The current Registration and Attendance pages use `cv2.imshow`, which is incompatible with Streamlit's web-based interface. I will migrate these to use Streamlit's native camera input and image display components.

## Proposed Changes

### Core Logic (Utils)

#### [MODIFY] [attendance.py](file:///J:/PROJECT/CSE499.15-MSRB-GROUP-7/attendance_system/utils/attendance.py)
- Implement `process_attendance_image(image)`:
    - Detect all faces in the image.
    - Recognize each face against the database.
    - Mark recognized students as present.
    - Return the image with bounding boxes and labels drawn.

#### [MODIFY] [registration.py](file:///J:/PROJECT/CSE499.15-MSRB-GROUP-7/attendance_system/utils/registration.py)
- Refactor `register_student` to accept a list of images/embeddings instead of managing its own `cv2.VideoCapture` loop, making it compatible with the Streamlit UI.
- Use `DEEPFACE_MODEL` and `DEEPFACE_DETECTOR` from `config.py` instead of hardcoded values.

### User Interface (Streamlit)

#### [MODIFY] [registration_page.py](file:///J:/PROJECT/CSE499.15-MSRB-GROUP-7/attendance_system/ui/registration_page.py)
- Use `st.camera_input` to capture the 10-15 samples required by the timeline.
- Add a progress bar for sample collection.
- Trigger the registration logic once enough samples are collected.

#### [MODIFY] [attendance_page.py](file:///J:/PROJECT/CSE499.15-MSRB-GROUP-7/attendance_system/ui/attendance_page.py)
- Add `st.camera_input` or `st.file_uploader` for capturing/uploading images.
- Call `process_attendance_image` and display the results.
- Show a table of students marked present in the current session.

#### [MODIFY] [reports_page.py](file:///J:/PROJECT/CSE499.15-MSRB-GROUP-7/attendance_system/ui/reports_page.py)
- Add a proper `st.download_button` to allow users to download the exported CSV directly.

## Verification Plan

### Automated Tests
- Run existing tests in `tests/` to ensure no regression in database or recognition logic.
- Create a new test `tests/test_attendance_pipeline.py` to verify `process_attendance_image`.

### Manual Verification
- Run the Streamlit app (`streamlit run main.py`).
- Verify student registration with `st.camera_input`.
- Verify attendance marking by uploading a group photo or using the webcam.
- Export and download the attendance report.
