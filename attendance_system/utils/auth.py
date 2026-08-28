"""User accounts for the attendance system.

Each account owns its own students and attendance records. Passwords are
hashed with werkzeug (scrypt/pbkdf2) — never stored in plain text.
"""

from werkzeug.security import check_password_hash, generate_password_hash

from database.db_manager import (
    claim_legacy_data,
    count_users,
    create_user_row,
    get_user_by_id,
    get_user_by_username,
)

USERNAME_MIN_LENGTH = 3
PASSWORD_MIN_LENGTH = 6


def create_user(username, password, display_name=None):
    """Create an account. Returns (user, error).

    The first account ever created inherits the students/attendance that
    existed before the login system, so no demo data is lost on upgrade.
    """
    username = (username or "").strip()
    password = password or ""

    if len(username) < USERNAME_MIN_LENGTH:
        return None, f"Username must be at least {USERNAME_MIN_LENGTH} characters."
    if len(password) < PASSWORD_MIN_LENGTH:
        return None, f"Password must be at least {PASSWORD_MIN_LENGTH} characters."

    is_first_account = count_users() == 0
    user_id = create_user_row(
        username, generate_password_hash(password), (display_name or "").strip() or username
    )
    if user_id is None:
        return None, "That username is already taken."

    if is_first_account:
        claim_legacy_data(user_id)

    return get_user_by_id(user_id), None


def verify_user(username, password):
    """Return the user dict if the credentials match, else None."""
    user = get_user_by_username((username or "").strip())
    if not user:
        return None
    if not check_password_hash(user["password_hash"], password or ""):
        return None
    return user
