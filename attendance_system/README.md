# CampusEye: Sophisticated Campus Monitoring System

An AI-driven classroom monitoring and biometric attendance ecosystem with an
elegant Flask web interface, designed to scale to campus-wide CCTV continuous monitoring.

## Features
- **Login system** — each person gets their own private attendance workspace:
  create an account, and your students/attendance are visible only to you
- Student registration by uploading face sample photos
- Face detection and recognition powered by DeepFace (Facenet)
- Attendance marking from a single classroom photo
- Daily attendance log and reports with CSV export
- Dashboard with live statistics

## Run the web app

```bash
# with the project venv
.venv\Scripts\python main.py          # Windows
# or: python main.py
```

Then open **http://127.0.0.1:5000** in your browser.

### First login

1. You are redirected to the login page — click **Create an account**.
2. Pick a username (3+ characters) and password (6+ characters).
3. The **first account created automatically inherits all students and
   attendance that existed before the login system**, so nothing is lost.
4. Every further account starts with an empty workspace and only ever sees
   its own data. Passwords are stored hashed (werkzeug), never in plain text.

## Project structure

| Path | Purpose |
| --- | --- |
| `main.py` | Entry point — launches the Flask app |
| `web/` | Flask app: routes, JSON API, templates, static assets |
| `web/auth.py` | Login / sign-up / logout routes and session handling |
| `utils/` | Detection, recognition, registration, attendance, auth logic |
| `database/` | SQLite storage (`attendance.db`, auto-migrated on first run) |
| `models/` | Haar cascade for face detection |
| `tests/` | Weekly progress test suites + `test_auth.py` (login & isolation) |
