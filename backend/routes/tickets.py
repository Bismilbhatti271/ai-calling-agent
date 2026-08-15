from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..database import get_db
from .auth import get_current_user, require_admin, require_user
from .notifications import add_notification

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


class CreateTicketBody(BaseModel):
    subject: str
    message: str


class ReplyTicketBody(BaseModel):
    message: str


class UpdateTicketBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


def generate_token(user_id: int, ticket_count: int) -> str:
    import random
    import string
    year = datetime.utcnow().year
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"TKT-{year}-{str(ticket_count + 1).zfill(3)}-{suffix}"


@router.get("")
def list_tickets(current_user: dict = Depends(require_user)):
    """List tickets. Admin sees all, users see only their own."""
    with get_db() as db:
        if current_user["role"] == "admin":
            rows = db.execute(
                "SELECT * FROM tickets ORDER BY created_at DESC"
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC",
                (current_user["user_id"],),
            ).fetchall()

        tickets = []
        for row in rows:
            tickets.append({
                "id": row["id"],
                "user_id": row["user_id"],
                "user_name": row["user_name"],
                "subject": row["subject"],
                "message": row["message"],
                "token": row["token"],
                "status": row["status"],
                "priority": row["priority"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            })
        return tickets


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, current_user: dict = Depends(require_user)):
    """Get a single ticket with its replies."""
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM tickets WHERE id = ?", (ticket_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Non-admin users can only see their own tickets
        if current_user["role"] != "admin" and row["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        replies = db.execute(
            "SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC",
            (ticket_id,),
        ).fetchall()

        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "subject": row["subject"],
            "message": row["message"],
            "token": row["token"],
            "status": row["status"],
            "priority": row["priority"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "replies": [
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "user_name": r["user_name"],
                    "message": r["message"],
                    "is_admin": bool(r["is_admin"]),
                    "created_at": r["created_at"],
                }
                for r in replies
            ],
        }


@router.post("")
def create_ticket(body: CreateTicketBody, current_user: dict = Depends(require_user)):
    """Create a new support ticket."""
    if not body.subject.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Subject and message are required")

    with get_db() as db:
        # Count user's tickets for token generation
        count = db.execute(
            "SELECT COUNT(*) FROM tickets WHERE user_id = ?",
            (current_user["user_id"],),
        ).fetchone()[0]

        token = generate_token(current_user["user_id"], count)
        now = datetime.utcnow().isoformat()

        cur = db.execute(
            "INSERT INTO tickets (user_id, user_name, subject, message, token, status, priority, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 'open', 'medium', ?, ?)",
            (current_user["user_id"], current_user.get("user_name", "Unknown"),
             body.subject.strip(), body.message.strip(), token, now, now),
        )
        ticket_id = cur.lastrowid

        # Log activity
        from ..auth import log_activity
        log_activity(
            current_user["user_id"],
            current_user.get("user_name", "Unknown"),
            "create_ticket",
            f"Created support ticket: {body.subject[:50]}... (Token: {token})",
        )

        # Notify all admins about new ticket
        add_notification(
            "info",
            "New Support Ticket",
            f"{current_user.get('user_name', 'Unknown')} created a ticket: {body.subject[:60]}",
            is_global=True,
        )

        return {
            "id": ticket_id,
            "token": token,
            "message": "Ticket created successfully",
        }


@router.post("/{ticket_id}/reply")
def reply_ticket(ticket_id: int, body: ReplyTicketBody, current_user: dict = Depends(require_user)):
    """Reply to a ticket. Admin can reply to any ticket. Users can reply to their own tickets."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    with get_db() as db:
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Non-admin users can only reply to their own tickets
        if current_user["role"] != "admin" and row["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        # If the ticket is resolved, don't allow replies
        if row["status"] == "resolved":
            raise HTTPException(status_code=400, detail="Cannot reply to a resolved ticket")

        is_admin = 1 if current_user["role"] == "admin" else 0
        now = datetime.utcnow().isoformat()

        db.execute(
            "INSERT INTO ticket_replies (ticket_id, user_id, user_name, message, is_admin, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (ticket_id, current_user["user_id"], current_user.get("user_name", "Unknown"),
             body.message.strip(), is_admin, now),
        )

        # Update the ticket's updated_at and change status to in_progress if admin replied
        if is_admin and row["status"] == "open":
            db.execute(
                "UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?",
                (now, ticket_id),
            )

        db.execute(
            "UPDATE tickets SET updated_at = ? WHERE id = ?",
            (now, ticket_id),
        )

        # Notify relevant users about the reply
        if is_admin:
            # Admin replied → notify the ticket owner
            add_notification(
                "info",
                "Ticket Update",
                f"Admin replied to your ticket: {row['subject'][:60]}",
                user_id=row["user_id"],
                is_global=False,
            )
        else:
            # User replied → notify all admins
            add_notification(
                "info",
                "New Ticket Reply",
                f"{current_user.get('user_name', 'Unknown')} replied to ticket: {row['subject'][:60]}",
                is_global=True,
            )

        # Return all replies
        replies = db.execute(
            "SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC",
            (ticket_id,),
        ).fetchall()

        return {
            "message": "Reply sent successfully",
            "replies": [
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "user_name": r["user_name"],
                    "message": r["message"],
                    "is_admin": bool(r["is_admin"]),
                    "created_at": r["created_at"],
                }
                for r in replies
            ],
        }


@router.patch("/{ticket_id}")
def update_ticket(ticket_id: int, body: UpdateTicketBody, current_user: dict = Depends(require_user)):
    """Update ticket status/priority. Only admins can update status."""
    with get_db() as db:
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")

        updates = {}
        if body.status is not None:
            if current_user["role"] != "admin":
                raise HTTPException(status_code=403, detail="Only admins can update ticket status")
            if body.status not in ("open", "in_progress", "resolved"):
                raise HTTPException(status_code=400, detail="Invalid status")
            updates["status"] = body.status

        if body.priority is not None:
            if current_user["role"] != "admin":
                raise HTTPException(status_code=403, detail="Only admins can update ticket priority")
            if body.priority not in ("high", "medium", "low"):
                raise HTTPException(status_code=400, detail="Invalid priority")
            updates["priority"] = body.priority

        if updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [ticket_id]
            db.execute(f"UPDATE tickets SET {sets} WHERE id = ?", vals)

            # Notify user when ticket is resolved
            if body.status == "resolved":
                add_notification(
                    "success",
                    "Ticket Resolved",
                    f"Your ticket '{row['subject'][:60]}' has been resolved.",
                    user_id=row["user_id"],
                    is_global=False,
                )

        # Return updated ticket
        updated = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()

        return {
            "id": updated["id"],
            "user_id": updated["user_id"],
            "user_name": updated["user_name"],
            "subject": updated["subject"],
            "message": updated["message"],
            "token": updated["token"],
            "status": updated["status"],
            "priority": updated["priority"],
            "created_at": updated["created_at"],
            "updated_at": updated["updated_at"],
        }
