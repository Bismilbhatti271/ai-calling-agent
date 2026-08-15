"""
Knowledge Base Routes
=====================
Store and manage documents that the AI agent can reference during calls.
Each document belongs to a campaign and is injected into the agent's system prompt
when a call starts.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..database import get_db
from .auth import get_current_user, require_user
from ..auth import log_activity

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])


class DocumentCreate(BaseModel):
    campaign_id: int
    title: str
    content: str


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


@router.get("/campaign/{campaign_id}")
def list_documents(campaign_id: int, user: dict = Depends(require_user)):
    """List all knowledge documents for a campaign."""
    with get_db() as db:
        rows = db.execute(
            "SELECT id, campaign_id, title, content, created_at, updated_at "
            "FROM knowledge_documents WHERE campaign_id = ? ORDER BY created_at DESC",
            (campaign_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{doc_id}")
def get_document(doc_id: int, user: dict = Depends(require_user)):
    """Get a single knowledge document."""
    with get_db() as db:
        row = db.execute(
            "SELECT id, campaign_id, title, content, created_at, updated_at "
            "FROM knowledge_documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return dict(row)


@router.post("")
def create_document(body: DocumentCreate, user: dict = Depends(require_user)):
    """Create a new knowledge document."""
    if not body.title.strip() or not body.content.strip():
        raise HTTPException(status_code=400, detail="Title and content are required")
    with get_db() as db:
        # Verify campaign exists
        camp = db.execute("SELECT id FROM campaigns WHERE id = ?", (body.campaign_id,)).fetchone()
        if not camp:
            raise HTTPException(status_code=404, detail="Campaign not found")
        cur = db.execute(
            "INSERT INTO knowledge_documents (campaign_id, title, content) VALUES (?, ?, ?)",
            (body.campaign_id, body.title.strip(), body.content.strip()),
        )
        log_activity(user["user_id"], user["user_name"], "create_kb_doc",
                     f"Created KB doc '{body.title}' for campaign {body.campaign_id}")
        return {"id": cur.lastrowid, "message": "Document created"}


@router.put("/{doc_id}")
def update_document(doc_id: int, body: DocumentUpdate, user: dict = Depends(require_user)):
    """Update a knowledge document."""
    with get_db() as db:
        existing = db.execute("SELECT id FROM knowledge_documents WHERE id = ?", (doc_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Document not found")
        updates = {}
        if body.title is not None:
            updates["title"] = body.title.strip()
        if body.content is not None:
            updates["content"] = body.content.strip()
        if updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [doc_id]
            db.execute(f"UPDATE knowledge_documents SET {sets} WHERE id = ?", vals)
        log_activity(user["user_id"], user["user_name"], "update_kb_doc",
                     f"Updated KB doc {doc_id}")
        return {"message": "Document updated"}


@router.delete("/{doc_id}")
def delete_document(doc_id: int, user: dict = Depends(require_user)):
    """Delete a knowledge document."""
    with get_db() as db:
        existing = db.execute("SELECT id, title FROM knowledge_documents WHERE id = ?", (doc_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Document not found")
        db.execute("DELETE FROM knowledge_documents WHERE id = ?", (doc_id,))
        log_activity(user["user_id"], user["user_name"], "delete_kb_doc",
                     f"Deleted KB doc '{existing['title']}'")
        return {"message": "Document deleted"}


@router.post("/search/{campaign_id}")
def search_documents(campaign_id: int, query: str = Query(..., min_length=1),
                     user: dict = Depends(require_user)):
    """Simple text search across knowledge documents for a campaign."""
    with get_db() as db:
        # Simple LIKE search on title and content
        search_term = f"%{query}%"
        rows = db.execute(
            "SELECT id, campaign_id, title, content, created_at, updated_at "
            "FROM knowledge_documents WHERE campaign_id = ? AND (title LIKE ? OR content LIKE ?) "
            "ORDER BY created_at DESC LIMIT 10",
            (campaign_id, search_term, search_term),
        ).fetchall()
        return [dict(r) for r in rows]
