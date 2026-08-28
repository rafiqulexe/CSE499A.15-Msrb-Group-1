"""Tests for the login system: accounts, password hashing and per-user data isolation.

Runs entirely against a temporary database so the real attendance.db is never
touched.
"""

import numpy as np
import pytest

import database.db_manager as dbm
from utils import attendance as att


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(dbm, "DATABASE_PATH", str(tmp_path / "auth_test.db"))
    dbm.init_database()
    att._known_students_cache = {}
    yield dbm
    att._known_students_cache = {}


@pytest.fixture
def client(temp_db, tmp_path, monkeypatch):
    import web.app as web_app_module

    monkeypatch.setattr(web_app_module, "DATA_DIR", str(tmp_path / "data"))
    app = web_app_module.create_app()
    app.secret_key = "test-secret"
    with app.test_client() as test_client:
        yield test_client


def _fake_embedding(seed):
    rng = np.random.default_rng(seed)
    return rng.normal(size=128)


# ------------------------------------------------------------- accounts

def test_create_and_verify_user(temp_db):
    from utils.auth import create_user, verify_user

    user, error = create_user("alice", "secret123", "Alice A.")
    assert error is None and user is not None
    assert user["username"] == "alice"
    assert user["display_name"] == "Alice A."

    assert verify_user("alice", "secret123") is not None
    assert verify_user("alice", "wrongpass") is None
    assert verify_user("ghost", "secret123") is None


def test_duplicate_username_rejected(temp_db):
    from utils.auth import create_user

    assert create_user("alice", "secret123")[0] is not None
    user, error = create_user("alice", "otherpass")
    assert user is None
    assert "taken" in error


def test_short_credentials_rejected(temp_db):
    from utils.auth import create_user

    assert create_user("ab", "secret123")[0] is None       # username < 3 chars
    assert create_user("alice", "123")[0] is None          # password < 6 chars


def test_passwords_are_hashed(temp_db):
    from utils.auth import create_user

    create_user("alice", "secret123")
    row = dbm.get_user_by_username("alice")
    assert row["password_hash"] != "secret123"
    assert ":" in row["password_hash"]  # werkzeug "method:salt:hash" format


def test_first_account_claims_legacy_data(temp_db):
    from utils.auth import create_user

    # Pre-login rows are owned by user 0.
    dbm.add_student("LEGACY1", "Legacy Student", _fake_embedding(1), owner_id=0)
    att.mark_attendance("LEGACY1", attendance_date="2026-01-01", owner_id=0)

    first, _ = create_user("first", "secret123")
    assert dbm.get_all_students(first["id"])[0]["student_id"] == "LEGACY1"
    assert att.get_attendance_records("2026-01-01", first["id"])

    # Later accounts do NOT inherit anything.
    dbm.add_student("LEGACY2", "Orphan", _fake_embedding(2), owner_id=0)
    second, _ = create_user("second", "secret123")
    assert dbm.get_all_students(second["id"]) == []


# --------------------------------------------------- per-user data isolation

def test_students_scoped_per_owner(temp_db):
    from utils.auth import create_user

    alice, _ = create_user("alice", "secret123")
    bob, _ = create_user("bob", "secret123")

    # Both accounts may register the SAME student id independently.
    assert dbm.add_student("S001", "Alice's Student", _fake_embedding(3), alice["id"])
    assert dbm.add_student("S001", "Bob's Student", _fake_embedding(4), bob["id"])

    alice_students = dbm.get_all_students(alice["id"])
    bob_students = dbm.get_all_students(bob["id"])
    assert len(alice_students) == 1 and alice_students[0]["name"] == "Alice's Student"
    assert len(bob_students) == 1 and bob_students[0]["name"] == "Bob's Student"
    assert dbm.get_student_count(alice["id"]) == 1
    assert dbm.get_student_count(bob["id"]) == 1

    # Deleting in one account leaves the other untouched.
    dbm.delete_student("S001", alice["id"])
    assert dbm.get_student_count(alice["id"]) == 0
    assert dbm.get_student_count(bob["id"]) == 1


def test_attendance_scoped_per_owner(temp_db):
    from utils.auth import create_user

    alice, _ = create_user("alice", "secret123")
    bob, _ = create_user("bob", "secret123")
    dbm.add_student("S001", "Alice's Student", _fake_embedding(5), alice["id"])
    dbm.add_student("S001", "Bob's Student", _fake_embedding(6), bob["id"])

    att.mark_attendance("S001", attendance_date="2026-02-02", owner_id=alice["id"])

    alice_records = att.get_attendance_records_detailed("2026-02-02", alice["id"])
    bob_records = att.get_attendance_records_detailed("2026-02-02", bob["id"])
    assert len(alice_records) == 1
    assert alice_records[0]["name"] == "Alice's Student"  # join stays per-owner
    assert bob_records == []


def test_embedding_cache_is_per_owner(temp_db):
    from utils.auth import create_user

    alice, _ = create_user("alice", "secret123")
    bob, _ = create_user("bob", "secret123")
    dbm.add_student("S001", "Alice's Student", _fake_embedding(7), alice["id"])

    assert len(att.get_cached_students(owner_id=alice["id"])) == 1
    assert att.get_cached_students(owner_id=bob["id"]) == []

    dbm.add_student("S009", "Another", _fake_embedding(8), alice["id"])
    # Cache must not go stale after a new registration.
    assert len(att.get_cached_students(force_refresh=True, owner_id=alice["id"])) == 2


# ------------------------------------------------------------ web endpoints

def test_unauthenticated_requests_blocked(client):
    page = client.get("/")
    assert page.status_code == 302
    assert "/login" in page.headers["Location"]

    api = client.get("/api/stats")
    assert api.status_code == 401
    assert api.get_json()["ok"] is False


def test_signup_login_logout_flow(client):
    signup = client.post(
        "/signup",
        data={"username": "alice", "password": "secret123", "display_name": "Alice"},
        follow_redirects=True,
    )
    assert signup.status_code == 200

    stats = client.get("/api/stats")
    assert stats.status_code == 200
    assert stats.get_json()["ok"] is True

    # The dashboard renders the signed-in user's name.
    dashboard = client.get("/")
    assert b"Alice" in dashboard.data

    client.post("/logout")
    assert client.get("/api/stats").status_code == 401


def test_login_with_wrong_password(client):
    from utils.auth import create_user

    create_user("alice", "secret123")

    bad = client.post("/login", data={"username": "alice", "password": "nope"})
    assert bad.status_code == 401
    assert b"Incorrect username or password" in bad.data

    good = client.post(
        "/login",
        data={"username": "alice", "password": "secret123"},
        follow_redirects=True,
    )
    assert good.status_code == 200
    assert client.get("/api/stats").status_code == 200


def test_signup_duplicate_username_shows_error(client):
    client.post("/signup", data={"username": "alice", "password": "secret123"})
    dup = client.post("/signup", data={"username": "alice", "password": "secret123"})
    assert dup.status_code == 400
    assert b"already taken" in dup.data
