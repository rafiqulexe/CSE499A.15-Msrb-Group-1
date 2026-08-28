# database/db_manager.py
import sqlite3
import pickle
import numpy as np
import os
import sys

# Fix: Add parent directory to path so 'config' can be found
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from config import DATABASE_PATH

# Legacy rows created before the login system existed are owned by user 0.
# The first account created claims them (see utils/auth.create_user).
LEGACY_OWNER_ID = 0

_schema_ready_for = None

def get_connection():
    """Create and return database connection.

    The first connection to a database file also ensures the schema exists
    (and migrates a pre-login database), so callers that never run
    init_database() explicitly still work against the current schema.
    """
    global _schema_ready_for
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    if _schema_ready_for != DATABASE_PATH:
        _ensure_schema(conn)
        _schema_ready_for = DATABASE_PATH
    return conn

def _table_columns(conn, table):
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}

def _migrate_legacy_tables(conn):
    """Rebuild pre-login tables so students/attendance carry an owner_id.

    SQLite cannot ALTER TABLE to add UNIQUE constraints, so the old tables
    are renamed, recreated with the new schema, and their rows copied with
    owner_id = LEGACY_OWNER_ID.
    """
    for table, create_sql, columns in [
        (
            "students",
            """
            CREATE TABLE students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                name TEXT NOT NULL,
                embedding BLOB NOT NULL,
                owner_id INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(owner_id, student_id)
            )
            """,
            "student_id, name, embedding, owner_id, created_at",
        ),
        (
            "attendance",
            """
            CREATE TABLE attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                owner_id INTEGER NOT NULL DEFAULT 0,
                date DATE NOT NULL,
                status TEXT DEFAULT 'Present',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(student_id),
                UNIQUE(owner_id, student_id, date)
            )
            """,
            "student_id, owner_id, date, status, timestamp",
        ),
    ]:
        cols = _table_columns(conn, table)
        if not cols or "owner_id" in cols:
            continue  # fresh install or already migrated
        conn.execute(f"ALTER TABLE {table} RENAME TO {table}_old")
        conn.execute(create_sql)
        conn.execute(
            f"INSERT INTO {table} ({columns}) "
            f"SELECT {columns.replace('owner_id', str(LEGACY_OWNER_ID))} FROM {table}_old"
        )
        conn.execute(f"DROP TABLE {table}_old")

def _ensure_schema(conn):
    """Create missing tables and migrate a pre-login schema in place."""
    _migrate_legacy_tables(conn)

    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            name TEXT NOT NULL,
            embedding BLOB NOT NULL,
            owner_id INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(owner_id, student_id)
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            owner_id INTEGER NOT NULL DEFAULT 0,
            date DATE NOT NULL,
            status TEXT DEFAULT 'Present',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id),
            UNIQUE(owner_id, student_id, date)
        )
    ''')

    conn.commit()


def init_database():
    """W1-T3, W1-T4: Create database and tables"""
    conn = get_connection()
    conn.close()
    print("Database initialized successfully!")

def add_student(student_id, name, embedding, owner_id=LEGACY_OWNER_ID):
    """Store student with averaged face embedding, scoped to an owner"""
    conn = get_connection()
    cursor = conn.cursor()
    embedding_blob = pickle.dumps(embedding.astype(np.float64))

    try:
        cursor.execute(
            "INSERT INTO students (student_id, name, embedding, owner_id) VALUES (?, ?, ?, ?)",
            (student_id, name, embedding_blob, owner_id)
        )
        conn.commit()
        print(f"Student '{name}' (ID: {student_id}) registered!")
        return True
    except sqlite3.IntegrityError:
        print(f"Student ID '{student_id}' already exists!")
        return False
    finally:
        conn.close()

def get_all_students(owner_id=None):
    """Retrieve students with their embeddings.

    owner_id=None returns every student (legacy global view used by the
    tests); the web app always passes the logged-in user's id so each
    account only sees its own students.
    """
    conn = get_connection()
    cursor = conn.cursor()
    if owner_id is None:
        cursor.execute("SELECT student_id, name, embedding FROM students")
    else:
        cursor.execute(
            "SELECT student_id, name, embedding FROM students WHERE owner_id = ?",
            (owner_id,)
        )

    students = []
    for row in cursor.fetchall():
        students.append({
            'student_id': row['student_id'],
            'name': row['name'],
            'embedding': pickle.loads(row['embedding'])
        })

    conn.close()
    return students

def get_student_count(owner_id=None):
    """Get total number of registered students (optionally per owner)"""
    conn = get_connection()
    cursor = conn.cursor()
    if owner_id is None:
        cursor.execute("SELECT COUNT(*) FROM students")
    else:
        cursor.execute("SELECT COUNT(*) FROM students WHERE owner_id = ?", (owner_id,))
    count = cursor.fetchone()[0]
    conn.close()
    return count

def delete_student(student_id, owner_id=None):
    """Remove a student from database (optionally scoped to an owner)"""
    conn = get_connection()
    cursor = conn.cursor()
    if owner_id is None:
        cursor.execute("DELETE FROM students WHERE student_id = ?", (student_id,))
    else:
        cursor.execute(
            "DELETE FROM students WHERE student_id = ? AND owner_id = ?",
            (student_id, owner_id)
        )
    conn.commit()
    conn.close()
    print(f"Student {student_id} deleted")

# ------------------------------------------------------------------- users

def count_users():
    """Number of registered accounts (used to detect first sign-up)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    conn.close()
    return count

def create_user_row(username, password_hash, display_name=None):
    """Insert an account row; returns the new user id or None on conflict."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
            (username, password_hash, display_name)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_user_by_username(username):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, password_hash, display_name FROM users WHERE username = ?",
        (username,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, display_name FROM users WHERE id = ?", (user_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def claim_legacy_data(owner_id):
    """Assign pre-login (owner 0) students and attendance to the first account."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE students SET owner_id = ? WHERE owner_id = ?", (owner_id, LEGACY_OWNER_ID))
    cursor.execute("UPDATE attendance SET owner_id = ? WHERE owner_id = ?", (owner_id, LEGACY_OWNER_ID))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_database()
    print(f"Database path: {DATABASE_PATH}")
