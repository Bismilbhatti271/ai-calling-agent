import os
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = os.environ.get("JWT_SECRET", "empire-x-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}:{pw_hash.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, pw_hash = stored.split(":", 1)
    computed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return computed.hex() == pw_hash


def create_token(user_id: int, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def log_activity(user_id: int, user_name: str, action: str, details: str = "", ip_address: str = ""):
    """Log user activity to the database."""
    from backend.database import get_db
    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO activity_log (user_id, user_name, action, details, ip_address) VALUES (?, ?, ?, ?, ?)",
                (user_id, user_name, action, details, ip_address),
            )
    except Exception as e:
        print(f"[ActivityLog] Error: {e}")
