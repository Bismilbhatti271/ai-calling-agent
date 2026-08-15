from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def add_notification(type: str, title: str, message: str = "", user_id: Optional[int] = None, is_global: bool = True):
    with get_db() as db:
        db.execute(
            "INSERT INTO notifications (type, title, message, user_id, is_global) VALUES (?, ?, ?, ?, ?)",
            (type, title, message, user_id, 1 if is_global else 0),
        )


@router.get("")
def list_notifications(since_id: int = 0, current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, type, title, message, is_read, created_at
            FROM notifications
            WHERE id > ? AND (is_global = 1 OR user_id = ?)
            ORDER BY id DESC
            LIMIT 50
            """,
            (since_id, current_user["user_id"]),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/unread-count")
def unread_count(current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE (is_global = 1 OR user_id = ?) AND is_read = 0",
            (current_user["user_id"],),
        ).fetchone()
        return {"count": row["cnt"]}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        db.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
        return {"message": "Marked as read"}


@router.post("/read-all")
def mark_all_read(current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "UPDATE notifications SET is_read = 1 WHERE (is_global = 1 OR user_id = ?) AND is_read = 0",
            (current_user["user_id"],),
        )
        return {"message": "All marked as read"}
