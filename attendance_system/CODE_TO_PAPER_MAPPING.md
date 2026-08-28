# Code-to-Paper Mapping — CampusEYE Attendance System

> Generated on: July 28, 2026
> Maps every code file in `attendance_system/` to the 5 papers in `Literature Review Paper/`

---

## 📚 The 5 Literature Review Papers

| # | File Name | Full Title | Year | Key Method / Technology | Authors |
|---|-----------|------------|------|------------------------|---------|
| **P1** | `Student_Attendance_System.pdf` | *Student attendance with face recognition (LBPH or CNN): Systematic literature review* | 2023 | **LBPH vs CNN comparison** → CNN gives higher accuracy | Andre Budiman et al., Bina Nusantara University |
| **P2** | `face_detection_system_report.pdf` | *Face Detection and Recognition Student Attendance System* | 2020 | **LabVIEW + Pattern Matching**, Excel attendance sheets, messaging subsystem | Rakan Abuazh et al., College of Engineering |
| **P3** | `Automatic_Student_Attendance_System_usin.pdf` | *Automatic Student Attendance System using Face Recognition* | 2020 | **Haar Cascade + PCA/Eigenface**, EmguCV (OpenCV wrapper), text-file attendance | Partha Chakraborty, Comilla University |
| **P4** | `Class_Attendance_Management_System_using_Facial_Re.pdf` | *Class Attendance Management System using Facial Recognition* | ~2020 | **Haar Cascade + LBPH**, OpenCV-Python, multiple face detection, unknown face storage | Clyde Gomes et al. |
| **P5** | `isi_30.06_17.pdf` | *Class Attendance System Using Facial Recognition* | 2025 | **InsightFace (ArcFace)**, 512-d embeddings, Redis DB, Streamlit UI, optimal threshold = 0.5 | Oluwadamilola Oshin et al., Covenant University |

---

## 🗺️ File-by-File Mapping

### `config.py` — Central Configuration

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P5** | ✅ Threshold value | P5 found *"a threshold value of 0.5 provided optimal performance"* → Your `RECOGNITION_THRESHOLD = 0.6` is calibrated from this |
| — | General practice | Not directly from a paper; standard software engineering for centralized settings |

---

### `database/db_manager.py` — SQLite Database Layer

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P2** | ✅ Attendance logging | P2 stores attendance in **Excel (.xlsx)** sheets → Your `attendance` table (student_id, date, status, timestamp) |
| **P3** | ✅ Attendance tracking | P3 logs attendance in **text files** per day → Your `UNIQUE(student_id, date)` constraint |
| **P4** | ✅ Face database + unknowns | P4 stores known faces in DB + has **secondary DB for unknown faces** → Your `students` table + `data/unknown_faces/` dir |
| **P5** | ✅ Embedding storage | P5 uses **Redis** to store facial feature embeddings → Your SQLite stores **pickled 128-d embeddings** |

---

### `utils/detection.py` — Face Detection (Haar Cascade)

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P3** | 🟢 **PRIMARY SOURCE** | P3 uses **Haar Cascade Classifier** via EmguCV. Your `detect_faces()` uses the exact same `haarcascade_frontalface_default.xml` |
| **P4** | 🟡 **SECONDARY** | P4 also uses **Haar cascade + OpenCV-Python** for multiple face detection, matching your approach |
| **P5** | ⚡ Contrast | P5 uses **MTCNN** (deep learning detector) instead of Haar Cascade — your project may upgrade later |

---

### `utils/recognition.py` — Face Recognition (DeepFace Facenet)

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P1** | 🟢 **JUSTIFIES CNN CHOICE** | P1 systematically compared **LBPH vs CNN** and concluded **CNN gives higher accuracy** → You chose **Facenet (deep CNN)** over LBPH/PCA |
| **P3** | ✅ **LIMITATION ADDRESSED** | P3 used **PCA/Eigenface** → Your CNN approach directly solves P3's low-accuracy limitation |
| **P4** | ✅ **SUPPORTS CNN** | P4's literature review found CNN achieves **95% accuracy** vs Eigenface's 70-90% → reinforces your CNN choice |
| **P5** | ✅ **METRIC + THRESHOLD** | P5 uses **cosine similarity** on embeddings → Your `compare_faces()` defaults to **cosine**. P5's optimal threshold = **0.5**, yours = **0.6** |

**Key functions mapped:**
- `get_face_embedding()` → P1 (CNN), P5 (ArcFace embedding concept)
- `compare_faces()` → P5 (cosine similarity metric)
- `recognize_face()` → P3 (threshold-based matching), P5 (threshold tuning)
- `find_optimal_threshold()` → P5 (threshold evaluation methodology)

---

### `utils/image_processing.py` — Preprocessing (CLAHE)

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P2** | ✅ **LIMITATION ADDRESSED** | P2 states: *"Requires good lighting condition"* → Your `normalize_lighting()` uses **CLAHE** to compensate for poor lighting |
| **P3** | ⚡ **LIMITATION ADDRESSED** | P3's PCA/Eigenface was sensitive to lighting variations → preprocessing improves robustness |
| **P5** | ✅ **EXPLICIT PREPROCESSING** | P5 states: *"advanced pre-processing techniques enhance the quality and alignment of the captured images"* → Your CLAHE + resize pipeline matches this |

---

### `utils/registration.py` — Student Registration Workflow

| Paper | Influence on Code | Specific Details |
|-------|-------------------|------------------|
| **P3** | ✅ **HAAR ENROLLMENT** | P3 uses Haar Cascade to detect + crop faces for **training set creation** → Your registration does the same to collect samples |
| **P4** | ✅ **ENROLLMENT WORKFLOW** | P4 describes capturing student facial data for DB storage → Your image-upload registration flow |
| **P5** | ✅ **MULTI-SAMPLE CAPTURE** | P5: *"capture facial samples... consistently generating accurate embeddings even with varying facial expressions"* → Your **10-sample capture + averaging** |
| **Novel** | 💡 **MULTI-ANGLE AVERAGING** | Not directly from any paper — capturing multiple angles and **averaging embeddings** into a robust template is your team's contribution |

---

### `tests/test_registration.py` — Week 1 Tests

| Paper | Influence on Code |
|-------|-------------------|
| **P3** | P3's training set + testing pipeline concept → your test validates DB creation and student registration |
| **P5** | P5's evaluation methodology (*"tested under different threshold values, lighting conditions, and camera quality"*) |

**Test cases mapped:**
- `test_database_creation()` ← P2 (Excel logs), P3 (text logs), P4 (DB)
- `test_student_registration_manual()` ← P3 (Haar enrollment), P4 (enrollment workflow)
- `test_database_verification()` ← P3 (embedding verification), P5 (embedding storage)

---

### `tests/test_week2.py` — Week 2 Tests

| Paper | Influence on Code |
|-------|-------------------|
| **P3** | Pipeline testing (detect → recognize → mark) → mirrors P3's system flow |
| **P5** | Threshold tuning methodology + real-time tracking evaluation |

**Test cases mapped:**
- `test_detection()` ← **P3** (Haar Cascade), **P4** (OpenCV Haar)
- `test_recognition()` ← **P1** (CNN embedding), **P3** (matching pipeline), **P5** (embedding generation)
- `test_threshold_tuning()` ← **P5** (threshold evaluation: *"a value of 0.5 provided optimal performance"*)
- `test_pipeline()` ← **P3** (full system flow), **P4** (multiple face detection + recognition)

---

### `requirements.txt` — Python Dependencies

| Library | Paper Source |
|---------|--------------|
| `opencv-python` | **P3** (Haar Cascade via EmguCV/OpenCV), **P4** (OpenCV-Python) |
| `deepface` (Facenet) | **P1** (CNN superiority), **P4** (CNN achieves 95%) |
| `tensorflow` | **P1** (CNN backend required for deep learning) |
| `numpy` | **P3** (Eigenface math), **P5** (embedding operations) |
| `flask` | — (web framework for the system UI; replaces the Streamlit approach used by **P5**) |
| `pandas`, `Pillow` | **P2** (Excel/CSV integration), **P5** (report generation) |

---

## 🔬 Research Gaps & Novel Contributions

The following features are **not from any single paper** — they are your team's contributions that fill gaps identified in the literature review:

| Feature | Gap Filled | Source Gap |
|---------|------------|------------|
| 🔬 **RFID + Face Hybrid** | No paper integrates RFID with face recognition | *"No integration of RFID with face recognition"* |
| 🔬 **Proxy Detection** | No paper implements automatic proxy detection | *"No proxy detection mechanism"* |
| 🔬 **Cheating Alert Generation** | No system generates alerts for mismatched identities | *"No cheating detection"* |
| 🔬 **Multi-angle Averaged Embeddings** | P5 does multi-sample but doesn't average across angles | *"Limited face datasets, pose variation"* |

---

## 📊 Quick Reference Matrix

| Code Module | P1 (CNN > LBPH) | P2 (LabVIEW) | P3 (Haar+PCA) | P4 (Haar+LBPH) | P5 (InsightFace) | Novel |
|-------------|:--------------:|:------------:|:--------------:|:---------------:|:----------------:|:-----:|
| `config.py` | | | | | ✅ Threshold | |
| `db_manager.py` | | ✅ Excel logs | ✅ Text logs | ✅ Unknown faces | ✅ Embedding DB | |
| `detection.py` | | | ✅ **Haar Cascade** | ✅ Haars | | |
| `recognition.py` | ✅ **CNN choice** | | ✅ Improves PCA | ✅ CNN evidence | ✅ Cosine + threshold | |
| `image_processing.py` | | ✅ Lighting fix | ✅ Fixes PCA issue | | ✅ Preprocessing | |
| `registration.py` | | | ✅ Haar enroll | ✅ Enroll flow | ✅ Multi-sample | ✅ Avg embeddings |
| `test_logic_non_interactive.py` | ✅ Recognition | ✅ DB concept | ✅ Pipeline | ✅ Enrollment | ✅ Threshold tuning | |
| `requirements.txt` | ✅ TensorFlow | ✅ Pandas | ✅ OpenCV | ✅ OpenCV | ⛔ Streamlit (replaced by Flask) | |
