from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from .auth import get_current_user, require_user, require_admin
from ..auth import log_activity

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    model: str = "llama-3.1-8b-instant"
    voice_type: str = "en-US-GuyNeural"
    status: str = "active"


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    voice_type: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_agents(user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute("""
            SELECT a.*,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id) as real_total_calls,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND date(created_at) = date('now')) as real_calls_today,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred')) as real_conversions,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred') AND date(created_at) = date('now')) as real_conversions_today,
                   ROUND(CASE WHEN (SELECT COUNT(*) FROM calls WHERE agent_id = a.id) > 0
                        THEN CAST((SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred')) AS REAL)
                             / CAST((SELECT COUNT(*) FROM calls WHERE agent_id = a.id) AS REAL) * 100
                        ELSE 0 END, 1) as real_conversion_rate
            FROM agents a
            ORDER BY a.name
        """).fetchall()
        return [dict(r) for r in rows]


@router.get("/{agent_id}")
def get_agent(agent_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        row = db.execute("""
            SELECT a.*,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id) as real_total_calls,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND date(created_at) = date('now')) as real_calls_today,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred')) as real_conversions,
                   (SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred') AND date(created_at) = date('now')) as real_conversions_today,
                   ROUND(CASE WHEN (SELECT COUNT(*) FROM calls WHERE agent_id = a.id) > 0
                        THEN CAST((SELECT COUNT(*) FROM calls WHERE agent_id = a.id AND result IN ('conversion','transferred')) AS REAL)
                             / CAST((SELECT COUNT(*) FROM calls WHERE agent_id = a.id) AS REAL) * 100
                        ELSE 0 END, 1) as real_conversion_rate
            FROM agents a
            WHERE a.id = ?
        """, (agent_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        return dict(row)


@router.post("")
def create_agent(body: AgentCreate, user: dict = Depends(require_admin)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO agents (name, description, model, voice_type, status) VALUES (?, ?, ?, ?, ?)",
            (body.name, body.description, body.model, body.voice_type, body.status),
        )
        return {"id": cur.lastrowid, "message": "Agent created"}


@router.patch("/{agent_id}")
def update_agent(agent_id: int, body: AgentUpdate, user: dict = Depends(require_admin)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Agent not found")
        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.description is not None:
            updates["description"] = body.description
        if body.model is not None:
            updates["model"] = body.model
        if body.voice_type is not None:
            updates["voice_type"] = body.voice_type
        if body.status is not None:
            updates["status"] = body.status
        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [agent_id]
            db.execute(f"UPDATE agents SET {sets} WHERE id = ?", vals)
        return {"message": "Agent updated"}


@router.get("/{agent_id}/calls")
def agent_call_history(agent_id: int, limit: int = 20, user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT c.*, cp.name as campaign_name FROM calls c LEFT JOIN campaigns cp ON c.campaign_id = cp.id WHERE c.agent_id = ? ORDER BY c.created_at DESC LIMIT ?",
            (agent_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{agent_id}/stats")
def agent_detailed_stats(agent_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        total = db.execute("SELECT COUNT(*) as cnt FROM calls WHERE agent_id = ?", (agent_id,)).fetchone()["cnt"]
        today = db.execute("SELECT COUNT(*) as cnt FROM calls WHERE agent_id = ? AND date(created_at) = date('now')", (agent_id,)).fetchone()["cnt"]
        conversions = db.execute("SELECT COUNT(*) as cnt FROM calls WHERE agent_id = ? AND result IN ('conversion','transferred')", (agent_id,)).fetchone()["cnt"]
        transfers = db.execute("SELECT COUNT(*) as cnt FROM calls WHERE agent_id = ? AND result = 'transferred'", (agent_id,)).fetchone()["cnt"]
        declined = db.execute("SELECT COUNT(*) as cnt FROM calls WHERE agent_id = ? AND result = 'declined'", (agent_id,)).fetchone()["cnt"]
        campaigns = db.execute("SELECT cp.name, COUNT(*) as calls, SUM(CASE WHEN c.result IN ('conversion','transferred') THEN 1 ELSE 0 END) as convs FROM calls c JOIN campaigns cp ON c.campaign_id = cp.id WHERE c.agent_id = ? GROUP BY cp.name ORDER BY calls DESC", (agent_id,)).fetchall()
        return {
            "total_calls": total,
            "calls_today": today,
            "conversions": conversions,
            "transfers": transfers,
            "declined": declined,
            "by_campaign": [dict(r) for r in campaigns],
        }


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, user: dict = Depends(require_admin)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Agent not found")
        db.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        return {"message": "Agent deleted"}
