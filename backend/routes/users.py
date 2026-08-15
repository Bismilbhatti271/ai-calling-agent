from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..auth import hash_password, create_token
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserBody(BaseModel):
    email: str
    password: str
    name: str
    role: Optional[str] = "user"
    phone: Optional[str] = ""


class UpdateUserBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_users(_: dict = Depends(require_admin)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, email, name, role, phone, avatar, about, status, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{user_id}")
def get_user(user_id: int, _: dict = Depends(require_admin)):
    with get_db() as db:
        row = db.execute(
            "SELECT id, email, name, role, phone, avatar, about, status, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(row)


@router.post("")
def create_user(body: CreateUserBody, current_user: dict = Depends(require_admin)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        pw_hash = hash_password(body.password)
        cur = db.execute(
            "INSERT INTO users (email, password_hash, name, role, phone, avatar) VALUES (?, ?, ?, ?, ?, ?)",
            (body.email, pw_hash, body.name, body.role, body.phone,
             f"https://api.dicebear.com/7.x/avataaars/svg?seed={body.email}"),
        )
        from ..auth import log_activity
        log_activity(current_user["user_id"], current_user["user_name"], "create_user", f"Created user {body.email} with role {body.role}")
        return {"id": cur.lastrowid, "message": "User created"}


@router.patch("/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, current_user: dict = Depends(require_admin)):
    if user_id == 1:
        raise HTTPException(status_code=403, detail="The primary admin user cannot be modified")

    if current_user.get("user_id") != user_id and body.role is not None and body.role != "user":
        pass

    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.email is not None:
            dup = db.execute("SELECT id FROM users WHERE email = ? AND id != ?", (body.email, user_id)).fetchone()
            if dup:
                raise HTTPException(status_code=409, detail="Email already in use")
            updates["email"] = body.email
        if body.password is not None:
            updates["password_hash"] = hash_password(body.password)
        if body.role is not None:
            updates["role"] = body.role
        if body.phone is not None:
            updates["phone"] = body.phone
        if body.status is not None:
            updates["status"] = body.status

        if updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [user_id]
            db.execute(f"UPDATE users SET {sets} WHERE id = ?", vals)

        return {"message": "User updated"}


@router.delete("/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    if user_id == 1:
        raise HTTPException(status_code=403, detail="The primary admin user cannot be deleted")

    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        # Log before deletion
        from ..auth import log_activity
        log_activity(current_user["user_id"], current_user["user_name"], "delete_user", f"Deleted user ID {user_id}")
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return {"message": "User deleted"}


@router.get("/activity-log")
def get_user_activity(
    limit: int = Query(50, ge=1, le=500),
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    _: dict = Depends(require_admin),
):
    """Admin-only: Get user activity log with optional filters."""
    with get_db() as db:
        query = "SELECT * FROM activity_log WHERE 1=1"
        params = []
        if user_id is not None:
            query += " AND user_id = ?"
            params.append(user_id)
        if action:
            query += " AND action LIKE ?"
            params.append(f"%{action}%")
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = db.execute(query, params).fetchall()
        return [dict(r) for r in rows]


@router.get("/activity-log/summary")
def get_activity_summary(days: int = 7, _: dict = Depends(require_admin)):
    """Admin-only: Get summary of user activity grouped by user and action."""
    with get_db() as db:
        # Activity by user
        by_user = db.execute(
            """SELECT user_id, user_name, COUNT(*) as actions, 
               MAX(created_at) as last_active
               FROM activity_log 
               WHERE created_at >= datetime('now', ?)
               GROUP BY user_id ORDER BY actions DESC""",
            (f"-{days} days",),
        ).fetchall()

        # Activity by action type
        by_action = db.execute(
            """SELECT action, COUNT(*) as count 
               FROM activity_log 
               WHERE created_at >= datetime('now', ?)
               GROUP BY action ORDER BY count DESC""",
            (f"-{days} days",),
        ).fetchall()

        # Total activity today
        today_count = db.execute(
            "SELECT COUNT(*) as cnt FROM activity_log WHERE date(created_at) = date('now')"
        ).fetchone()["cnt"]

        return {
            "by_user": [dict(r) for r in by_user],
            "by_action": [dict(r) for r in by_action],
            "total_today": today_count,
            "period_days": days,
        }
