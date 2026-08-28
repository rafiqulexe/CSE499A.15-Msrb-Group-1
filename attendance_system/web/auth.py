"""Login / sign-up / logout routes for the web app."""

from flask import Blueprint, redirect, render_template, request, session, url_for

from utils.auth import create_user, verify_user

auth_bp = Blueprint("auth", __name__)


def _safe_next_target(default="/"):
    """Only follow ?next= paths that stay inside this site."""
    target = request.args.get("next") or request.form.get("next") or default
    if target.startswith("/") and not target.startswith("//"):
        return target
    return default


@auth_bp.get("/login")
def login_page():
    if session.get("user_id"):
        return redirect("/")
    return render_template("login.html")


@auth_bp.post("/login")
def login_submit():
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    user = verify_user(username, password)
    if not user:
        return render_template(
            "login.html",
            username=username,
            error="Incorrect username or password.",
        ), 401
    session.clear()
    session["user_id"] = user["id"]
    return redirect(_safe_next_target())


@auth_bp.get("/signup")
def signup_page():
    if session.get("user_id"):
        return redirect("/")
    return render_template("signup.html")


@auth_bp.post("/signup")
def signup_submit():
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    display_name = request.form.get("display_name", "")

    user, error = create_user(username, password, display_name)
    if user is None:
        return render_template(
            "signup.html",
            username=username,
            display_name=display_name,
            error=error,
        ), 400

    session.clear()
    session["user_id"] = user["id"]
    return redirect("/")


@auth_bp.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    return redirect(url_for("auth.login_page"))
