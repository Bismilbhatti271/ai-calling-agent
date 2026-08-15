from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..auth import hash_password, verify_password, create_token, decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


class SignupBody(BaseModel):
    email: str
    password: str
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "user"


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    about: Optional[str] = None
    avatar: Optional[str] = None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    # Fetch user info to enrich payload
    with get_db() as db:
        row = db.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            (payload["user_id"],),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        payload["user_name"] = row["name"]
        payload["user_email"] = row["email"]
        payload["role"] = row["role"]
    return payload


def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_user(user: dict = Depends(get_current_user)):
    """Require any authenticated user (both admin and regular users)."""
    return user


# Signup disabled — users can only be created by admin via /api/users
# @router.post("/signup")
# def signup(body: SignupBody):
#     with get_db() as db:
#         existing = db.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
#         if existing:
#             raise HTTPException(status_code=409, detail="Email already registered")
#         pw_hash = hash_password(body.password)
#         cur = db.execute(
#             "INSERT INTO users (email, password_hash, name, phone, role, avatar) VALUES (?, ?, ?, ?, ?, ?)",
#             (body.email, pw_hash, body.name, body.phone, body.role,
#              f"https://api.dicebear.com/7.x/avataaars/svg?seed={body.email}"),
#         )
#         user_id = cur.lastrowid
#         token = create_token(user_id, body.role)
#         return {
#             "token": token,
#             "user": {
#                 "id": user_id,
#                 "email": body.email,
#                 "name": body.name,
#                 "role": body.role,
#                 "phone": body.phone,
#                 "avatar": f"https://api.dicebear.com/7.x/avataaars/svg?seed={body.email}",
#                 "about": "",
#                 "status": "active",
#                 "created_at": datetime.utcnow().isoformat(),
#             },
#         }


@router.post("/login")
def login(body: LoginBody):
    with get_db() as db:
        row = db.execute(
            "SELECT id, email, password_hash, name, role, phone, avatar, about, status, created_at FROM users WHERE email = ?",
            (body.email,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_token(row["id"], row["role"])

        # Log login activity
        from ..auth import log_activity
        log_activity(row["id"], row["name"], "login", f"User {row['email']} logged in")

        return {
            "token": token,
            "user": {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "role": row["role"],
                "phone": row["phone"],
                "avatar": row["avatar"],
                "about": row["about"],
                "status": row["status"],
                "created_at": row["created_at"],
            },
        }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id, email, name, role, phone, avatar, about, status, created_at FROM users WHERE id = ?",
            (current_user["user_id"],),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "phone": row["phone"],
            "avatar": row["avatar"],
            "about": row["about"],
            "status": row["status"],
            "created_at": row["created_at"],
        }


@router.patch("/profile")
def update_profile(body: UpdateProfileBody, current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.email is not None:
            existing = db.execute("SELECT id FROM users WHERE email = ? AND id != ?", (body.email, current_user["user_id"])).fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Email already in use")
            updates["email"] = body.email
        if body.phone is not None:
            updates["phone"] = body.phone
        if body.about is not None:
            updates["about"] = body.about
        if body.avatar is not None:
            updates["avatar"] = body.avatar

        if updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [current_user["user_id"]]
            db.execute(f"UPDATE users SET {sets} WHERE id = ?", vals)

        row = db.execute(
            "SELECT id, email, name, role, phone, avatar, about, status, created_at FROM users WHERE id = ?",
            (current_user["user_id"],),
        ).fetchone()
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "phone": row["phone"],
            "avatar": row["avatar"],
            "about": row["about"],
            "status": row["status"],
            "created_at": row["created_at"],
        }


@router.post("/change-password")
def change_password(body: ChangePasswordBody, current_user: dict = Depends(get_current_user)):
    with get_db() as db:
        row = db.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["user_id"],)).fetchone()
        if not row or not verify_password(body.old_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        new_hash = hash_password(body.new_password)
        db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                   (new_hash, datetime.utcnow().isoformat(), current_user["user_id"]))
        return {"message": "Password changed successfully"}
