#!/usr/bin/env python3
"""
Tuff Project Task Manager
Manage project tasks via SQLite CLI
"""

import sqlite3
import argparse
from datetime import datetime
from pathlib import Path
from enum import Enum

DB_PATH = Path(__file__).parent / "tasks.db"


class Status(Enum):
    NOT_STARTED = "not-started"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"


def init_db():
    """Initialize the database if it doesn't exist."""
    if DB_PATH.exists():
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
    CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'not-started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )

    conn.commit()
    conn.close()
    print(f"✓ Initialized task database at {DB_PATH}")


def get_connection():
    """Get a database connection."""
    return sqlite3.connect(DB_PATH)


def readAll(status=None):
    """Read all tasks, optionally filtered by status."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    if status:
        cursor.execute(
            "SELECT id, title, description, status, created_at FROM tasks WHERE status = ? ORDER BY id",
            (status,),
        )
    else:
        cursor.execute(
            "SELECT id, title, description, status, created_at FROM tasks ORDER BY id"
        )

    rows = cursor.fetchall()
    conn.close()

    if not rows:
        print("No tasks found.")
        return

    # Print header
    print(f"\n{'ID':<4} {'Status':<12} {'Title':<50} {'Description':<30}")
    print("-" * 100)

    for row_id, title, description, task_status, created_at in rows:
        desc = (
            (description[:27] + "...")
            if description and len(description) > 30
            else (description or "")
        )
        title_display = (title[:47] + "...") if len(title) > 50 else title
        print(f"{row_id:<4} {task_status:<12} {title_display:<50} {desc:<30}")

    print()


def create(title, description=None, status="not-started"):
    """Create a new task."""
    init_db()

    # Validate status
    valid_statuses = [s.value for s in Status]
    if status not in valid_statuses:
        print(f"✗ Invalid status. Choose from: {', '.join(valid_statuses)}")
        return

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO tasks (title, description, status) VALUES (?, ?, ?)",
        (title, description, status),
    )

    conn.commit()
    task_id = cursor.lastrowid
    conn.close()

    print(f"✓ Created task #{task_id}: {title}")


def delete(task_id):
    """Delete a task by ID."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Check if task exists
    cursor.execute("SELECT title FROM tasks WHERE id = ?", (task_id,))
    task = cursor.fetchone()

    if not task:
        print(f"✗ Task #{task_id} not found.")
        conn.close()
        return

    cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()

    print(f"✓ Deleted task #{task_id}: {task[0]}")


def main():
    parser = argparse.ArgumentParser(description="Tuff Project Task Manager")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # readAll command
    read_parser = subparsers.add_parser("readAll", help="Read all tasks")
    read_parser.add_argument(
        "--status",
        choices=["not-started", "in-progress", "completed"],
        help="Filter by status",
    )

    # create command
    create_parser = subparsers.add_parser("create", help="Create a new task")
    create_parser.add_argument("title", help="Task title")
    create_parser.add_argument("-d", "--description", help="Task description")
    create_parser.add_argument(
        "-s",
        "--status",
        choices=["not-started", "in-progress", "completed"],
        default="not-started",
        help="Initial status (default: not-started)",
    )

    # delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a task")
    delete_parser.add_argument("id", type=int, help="Task ID")

    args = parser.parse_args()

    if args.command == "readAll":
        readAll(status=args.status)
    elif args.command == "create":
        create(args.title, args.description, args.status)
    elif args.command == "delete":
        delete(args.id)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
