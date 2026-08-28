# CampusEye: Sophisticated Campus Monitoring System — Codebase Documentation

## Project Overview

**CampusEye** is an AI-driven, modular campus monitoring and automated student attendance ecosystem designed for North South University (NSU). The system is designed to evolve from automated classroom attendance to full-campus continuous surveillance via CCTV feeds over an 8-week roadmap.

---

## File-by-File Breakdown

---

### `config.py` — Central Configuration File
**Purpose:** Single source of truth for all project settings.

- **Why it was made:** To avoid hardcoding paths and parameters across multiple files. If you need to change the threshold or directories, you change it here.
- **Key settings:**
  - Face models: `DEEPFACE_MODEL = "Facenet"`, `DEEPFACE_DETECTOR = "skip"`
  - File paths: `DATABASE_PATH`, `ENROLLED_DIR`, `UNKNOWN_DIR`, `LOGS_DIR`
  - Recognition threshold: `0.6` (Cosine distance cutoff for matching faces)
  - Registration samples: `10` frames per student
  - Automatically creates required directories on import

---

### `requirements.txt` — Python Dependencies
**Purpose:** Lists all third-party libraries needed to run the project.

- **Why it was made:** So anyone can run `pip install -r requirements.txt` to set up the environment.
- **Key libraries:**
  - `opencv-python` — image I/O, face detection (YuNet)
  - `deepface` — deep learning face recognition (Facenet model, 128-d embeddings)
  - `tensorflow` — backend for DeepFace's neural network
  - `flask` — web application framework (routes, templates, JSON API)
  - `numpy`, `pandas`, `Pillow` — data & image utilities

---

### `database/db_manager.py` — SQLite Database Layer
**Purpose:** All database operations (create, read, insert, delete) for user accounts, student records and attendance logs.

- **Why it was made:** To persist registered students and their face embeddings between sessions, and later log attendance dates. With the login system it also stores accounts and keeps every account's data separate.
- **Three tables:**
  - `users` — `username` (unique), `password_hash` (werkzeug-hashed, never plain text), `display_name`
  - `students` — stores `student_id`, `name`, `embedding` (pickled numpy array), `owner_id`, `created_at`; unique per `(owner_id, student_id)` so two accounts may both have a student "S001"
  - `attendance` — logs `student_id`, `owner_id`, `date`, `status` (Present/Absent) with a unique constraint per owner per student per day
- **Key functions:**
  - `init_database()` / `get_connection()` — ensure the schema exists; the first connection to an old database file automatically migrates it (adds `owner_id` columns) without losing data
  - `add_student(student_id, name, embedding, owner_id)` — inserts a new student (pickles the 128-d embedding) scoped to an account
  - `get_all_students(owner_id)` / `get_student_count(owner_id)` / `delete_student(student_id, owner_id)` — account-scoped queries; passing no `owner_id` keeps the legacy global behaviour used by the weekly tests
  - `create_user_row()`, `get_user_by_username()`, `get_user_by_id()`, `count_users()` — account CRUD
  - `claim_legacy_data(owner_id)` — one-time migration aid: pre-login rows (owner 0) are handed to the first account created
- Runs `init_database()` automatically when executed directly.

---

### `utils/auth.py` — Login System
**Purpose:** Account creation and password verification for the web app.

- **Why it was made:** Each teacher/person using the system gets a private workspace: their students, attendance records and reports are visible only to them.
- **Key functions:**
  - `create_user(username, password, display_name)` — validates lengths (username ≥ 3, password ≥ 6), hashes the password with werkzeug, and on the very first sign-up claims all legacy pre-login data
  - `verify_user(username, password)` — checks credentials against the stored hash
- The Flask side lives in `web/auth.py` (login / sign-up / logout routes) plus a `before_request` guard in `web/app.py` that redirects anonymous page requests to `/login` and returns HTTP 401 for anonymous `/api/*` calls. Sessions use a secret key persisted in `data/secret_key` so logins survive restarts.
- Covered by `tests/test_auth.py` (hashing, first-account claim, per-owner isolation of students/attendance/cache, and the endpoint guard).

---

### `utils/detection.py` — Face Detection Module
**Purpose:** Find faces in an image using OpenCV's Haar Cascade classifier.

- **Why it was made:** You can't recognize a face if you don't know *where* it is in the image. This draws bounding boxes around detected faces.
- **Key functions:**
  - `detect_faces(image)` — returns `[(x, y, w, h), ...]` for each face found
  - `draw_face_boxes(image, faces, labels)` — draws green rectangles with optional name labels
  - `extract_face(image, face_box)` — crops the face region with 20% padding
- **Note:** Uses CPU-based Haar Cascade (fast, no GPU needed), but less accurate than deep learning detectors like MTCNN.

---

### `utils/image_processing.py` — Image Preprocessing Utilities
**Purpose:** Clean up images before feeding them to the recognition pipeline.

- **Why it was made:** Real-world images have variable lighting and sizes. Preprocessing improves recognition accuracy.
- **Key functions:**
  - `resize_image(image, max_width)` — maintains aspect ratio, caps width at 1280px
  - `normalize_lighting(image)` — uses CLAHE (Contrast Limited Adaptive Histogram Equalization) on the LAB color space to fix uneven lighting
  - `preprocess_for_detection(image)` — combines resize + lighting normalization

---

### `utils/recognition.py` — Face Recognition Engine (DeepFace)
**Purpose:** Generate face embeddings and match them against the database.

- **Why it was made:** This is the core AI logic — convert a face into a 128-d numerical vector and find the closest match among enrolled students.
- **Key functions:**
  - `get_face_embedding(face_image)` — uses DeepFace's Facenet model to produce a 128-d embedding
  - `compare_faces(emb1, emb2, metric)` — computes cosine or Euclidean distance between two embeddings
  - `recognize_face(embedding, known_students)` — finds the student with the closest embedding, returns `{name, student_id, distance, match}`
  - `batch_recognize()` — recognizes multiple faces in one call (for group photos)
  - `find_optimal_threshold()` — tests thresholds from 0.1–0.8 to find the best cutoff

---

### `utils/registration.py` — Student Registration Workflow
**Purpose:** Image-upload-based registration of new students.

- **Why it was made:** You need a way to enroll students by uploading their face photos from multiple angles and averaging the embeddings into a robust template.
- **How it works:**
  1. User uploads photos of the student in the web UI (one face per photo)
  2. Detects the face in each image using YuNet
  3. Generates an embedding via DeepFace for every usable photo
  4. Collects 10 samples (configurable), then averages them
  5. Stores the averaged embedding + student ID in the database via `add_student()`

---

### `tests/` — Test Suites
**Purpose:** Automated, non-interactive validation of the core logic and web flows.

- **Why it was made:** To verify the deliverables without needing a webcam — all tests work on uploaded/synthetic images and the database.
- **Suites:**
  - `test_logic_non_interactive.py` — end-to-end logic: registration from images, attendance processing, recognition
  - `test_week3.py` / `test_week5.py` — attendance logging, reports and caching logic
  - `test_auth.py` — account creation, login and per-account data isolation

---

### `database/attendance.db` — SQLite Database File
**Purpose:** The actual SQLite database file.

- **Why it was made:** Persists student records and attendance logs on disk.

---

## 🔗 Data Flow Diagram

```
config.py (settings)
     ↓
registration.py ──→ uploaded images ──→ detection.py (find faces)
     │                              ↓
     │                    recognition.py (get_face_embedding)
     │                              ↓
     └────────────────→ db_manager.py (add_student to SQLite)
                              ↓
recognition.py ←── db_manager.py (get_all_students)
     ↓
detection.py (find faces in new image)
     ↓
recognition.py (recognize_face → compare embeddings)
     ↓
draw_face_boxes (show name on screen) / log attendance
```

---

## 🐛 Known Issues

- `recognition.py` imports `DEEPFACE_MODEL` and `DEEPFACE_DETECTOR` from `config.py`, but these constants are **missing** from `config.py`. The following should be added:

```python
DEEPFACE_MODEL = "Facenet"
DEEPFACE_DETECTOR = "opencv"
```

---

*Documentation generated on July 28, 2026*
