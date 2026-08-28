"""Flask web application for the student attendance system.

Serves the web UI (Jinja templates + static assets) and a small JSON API
that wraps the existing detection/recognition pipeline in ``utils/``.
"""

import base64
import csv
import io
import os
import secrets
from datetime import datetime

import cv2
import numpy as np
from flask import Flask, Response, jsonify, redirect, render_template, request, session, url_for

from config import DATA_DIR, NUM_REGISTRATION_SAMPLES
from database.db_manager import get_student_count, get_user_by_id, init_database
from utils.attendance import (
    get_attendance_records_detailed,
    get_cached_students,
    process_attendance_image,
)
from utils.registration import finalize_registration, process_registration_sample
from web.auth import auth_bp


def decode_image_payload(payload):
    """Decode a base64 data-URL (or raw base64) into a BGR image."""
    if not payload or not isinstance(payload, str):
        return None
    try:
        if "," in payload:
            payload = payload.split(",", 1)[1]
        buffer = np.frombuffer(base64.b64decode(payload), dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    except Exception:
        return None


def encode_image_payload(image):
    """Encode a BGR image as a JPEG data-URL."""
    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii")


def _load_secret_key():
    """Persist a random secret key so sessions survive app restarts."""
    os.makedirs(DATA_DIR, exist_ok=True)
    key_path = os.path.join(DATA_DIR, "secret_key")
    if os.path.exists(key_path):
        with open(key_path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    key = secrets.token_hex(32)
    with open(key_path, "w", encoding="utf-8") as handle:
        handle.write(key)
    return key


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024  # 64 MB uploads
    app.secret_key = _load_secret_key()
    app.register_blueprint(auth_bp)
    init_database()

    def current_owner_id():
        """user id of the logged-in account; every query is scoped to it."""
        return session.get("user_id")

    @app.before_request
    def require_login():
        # Auth pages and static assets are public; everything else needs a
        # logged-in account so each person only reaches their own data.
        if request.path.startswith("/static") or request.endpoint in (
            "auth.login_page",
            "auth.login_submit",
            "auth.signup_page",
            "auth.signup_submit",
        ):
            return None
        if session.get("user_id") is None:
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "error": "Not authenticated."}), 401
            return redirect(url_for("auth.login_page", next=request.path))
        return None

    @app.context_processor
    def inject_current_user():
        return {"current_user": get_user_by_id(session["user_id"]) if session.get("user_id") else None}

    # ------------------------------------------------------------------ pages
    @app.get("/")
    def index_page():
        return render_template("index.html")

    @app.get("/register")
    def register_page():
        return render_template("register.html", num_samples=NUM_REGISTRATION_SAMPLES)

    @app.get("/attendance")
    def attendance_page():
        return render_template("attendance.html")

    @app.get("/reports")
    def reports_page():
        return render_template("reports.html")

    # -------------------------------------------------------------------- api
    @app.get("/api/stats")
    def api_stats():
        owner_id = current_owner_id()
        today = datetime.now().strftime("%Y-%m-%d")
        records = get_attendance_records_detailed(today, owner_id)
        students = get_student_count(owner_id)
        present = len({r["student_id"] for r in records})
        return jsonify(
            {
                "ok": True,
                "today": today,
                "students": students,
                "present_today": present,
                "rate": round(100.0 * present / students, 1) if students else 0.0,
                "recent": list(reversed(records))[:8],
            }
        )

    @app.post("/api/register/batch")
    def api_register_batch():
        payload = request.get_json(silent=True) or {}
        images = payload.get("images") or []
        names = payload.get("names") or []
        if not isinstance(images, list) or not images:
            return jsonify({"ok": False, "error": "No images received."}), 400

        embeddings, errors = [], []
        for index, data_url in enumerate(images):
            label = names[index] if index < len(names) else f"Image {index + 1}"
            image = decode_image_payload(data_url)
            if image is None:
                errors.append(f"{label}: could not be read.")
                continue
            embedding, error = process_registration_sample(image)
            if embedding is None:
                errors.append(f"{label}: {error}")
            else:
                embeddings.append(embedding.tolist())

        return jsonify(
            {"ok": bool(embeddings), "embeddings": embeddings, "errors": errors}
        )

    @app.post("/api/register/finalize")
    def api_register_finalize():
        payload = request.get_json(silent=True) or {}
        student_id = (payload.get("student_id") or "").strip()
        name = (payload.get("name") or "").strip()
        embeddings = payload.get("embeddings") or []
        if not student_id or not name:
            return jsonify(
                {"ok": False, "error": "Student ID and name are required."}
            ), 400
        if not isinstance(embeddings, list) or len(embeddings) < NUM_REGISTRATION_SAMPLES:
            return jsonify(
                {
                    "ok": False,
                    "error": f"At least {NUM_REGISTRATION_SAMPLES} samples are required "
                    f"(received {len(embeddings) if isinstance(embeddings, list) else 0}).",
                }
            ), 400

        vectors = [np.asarray(e, dtype=np.float64) for e in embeddings]
        success = finalize_registration(student_id, name, vectors, owner_id=current_owner_id())
        if not success:
            return jsonify(
                {"ok": False, "error": f"Student ID '{student_id}' already exists."}
            ), 409

        # Refresh this account's embedding cache.
        get_cached_students(force_refresh=True, owner_id=current_owner_id())
        return jsonify({"ok": True, "student_id": student_id, "name": name})

    @app.post("/api/attendance")
    def api_attendance():
        payload = request.get_json(silent=True) or {}
        image = decode_image_payload(payload.get("image"))
        if image is None:
            return jsonify({"ok": False, "error": "Could not read the image."}), 400

        processed, matches = process_attendance_image(image, owner_id=current_owner_id())
        result_image = encode_image_payload(processed)
        if result_image is None:
            return jsonify(
                {"ok": False, "error": "Failed to encode the processed image."}
            ), 500

        recognized = [
            {
                "student_id": m["student_id"],
                "name": m["name"],
                "distance": m["distance"],
            }
            for m in matches
            if m.get("match")
        ]
        unknown = sum(1 for m in matches if not m.get("match"))
        return jsonify(
            {
                "ok": True,
                "image": result_image,
                "faces_detected": len(matches),
                "recognized": recognized,
                "unknown_count": unknown,
            }
        )

    @app.get("/api/attendance/records")
    def api_attendance_records():
        date = request.args.get("date") or datetime.now().strftime("%Y-%m-%d")
        return jsonify(
            {
                "ok": True,
                "date": date,
                "records": get_attendance_records_detailed(date, current_owner_id()),
            }
        )

    @app.get("/api/reports/download")
    def api_reports_download():
        date = request.args.get("date") or datetime.now().strftime("%Y-%m-%d")
        records = get_attendance_records_detailed(date, current_owner_id())
        buffer = io.StringIO()
        writer = csv.DictWriter(
            buffer, fieldnames=["student_id", "name", "date", "status", "timestamp"]
        )
        writer.writeheader()
        writer.writerows(records)
        return Response(
            buffer.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=attendance_{date}.csv"
            },
        )

    return app
