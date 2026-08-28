"""Entry point for the student attendance system.

Runs the Flask web app (the primary UI).
"""

from web.app import create_app


def main():
    app = create_app()
    # threaded keeps the UI responsive while DeepFace processes images;
    # the reloader is disabled to avoid loading TensorFlow twice.
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
