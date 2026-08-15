from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from .auth import get_current_user, require_user
from ..auth import log_activity

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    agent_id: int
    target_count: int = 0
    daily_target: int = 0


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    agent_id: Optional[int] = None
    target_count: Optional[int] = None
    daily_target: Optional[int] = None
    script: Optional[str] = None
    model: Optional[str] = None
    rebuttals: Optional[str] = None  # JSON string of objection → rebuttal dict


@router.get("")
def list_campaigns(user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT c.*, a.name as agent_name FROM campaigns c LEFT JOIN agents a ON c.agent_id = a.id ORDER BY c.created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT c.*, a.name as agent_name FROM campaigns c LEFT JOIN agents a ON c.agent_id = a.id WHERE c.id = ?",
            (campaign_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return dict(row)


@router.post("")
def create_campaign(body: CampaignCreate, user: dict = Depends(require_user)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO campaigns (name, description, agent_id, target_count, daily_target) VALUES (?, ?, ?, ?, ?)",
            (body.name, body.description, body.agent_id, body.target_count, body.daily_target),
        )
        log_activity(user["user_id"], user["user_name"], "create_campaign", f"Created campaign: {body.name}")
        return {"id": cur.lastrowid, "message": "Campaign created"}


@router.patch("/{campaign_id}")
def update_campaign(campaign_id: int, body: CampaignUpdate, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")

        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.description is not None:
            updates["description"] = body.description
        if body.agent_id is not None:
            updates["agent_id"] = body.agent_id
        if body.status is not None:
            updates["status"] = body.status
        if body.target_count is not None:
            updates["target_count"] = body.target_count
        if body.daily_target is not None:
            updates["daily_target"] = body.daily_target
        if body.script is not None:
            updates["script"] = body.script
        if body.model is not None:
            updates["model"] = body.model
        if body.rebuttals is not None:
            updates["rebuttals"] = body.rebuttals

        if updates:
            updates["updated_at"] = datetime.utcnow().isoformat()
            sets = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values()) + [campaign_id]
            db.execute(f"UPDATE campaigns SET {sets} WHERE id = ?", vals)

        log_activity(user["user_id"], user["user_name"], "update_campaign", f"Updated campaign {campaign_id}: {list(updates.keys())}")
        return {"message": "Campaign updated"}


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign_name = existing["name"] if "name" in existing else f"ID {campaign_id}"
        log_activity(user["user_id"], user["user_name"], "delete_campaign", f"Deleted campaign: {campaign_name}")
        db.execute("DELETE FROM leads WHERE campaign_id = ?", (campaign_id,))
        db.execute("DELETE FROM calls WHERE campaign_id = ?", (campaign_id,))
        db.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
        return {"message": "Campaign and associated data deleted"}


@router.post("/{campaign_id}/start")
def start_campaign(campaign_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute("SELECT id, status FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")
        db.execute("UPDATE campaigns SET status = 'active', updated_at = ? WHERE id = ?",
                   (datetime.utcnow().isoformat(), campaign_id))
        log_activity(user["user_id"], user["user_name"], "start_campaign", f"Started campaign {campaign_id}")
        return {"message": "Campaign started"}


@router.post("/{campaign_id}/pause")
def pause_campaign(campaign_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute("SELECT id, status FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")
        db.execute("UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?",
                   (datetime.utcnow().isoformat(), campaign_id))
        log_activity(user["user_id"], user["user_name"], "pause_campaign", f"Paused campaign {campaign_id}")
        return {"message": "Campaign paused"}


@router.post("/{campaign_id}/complete")
def complete_campaign(campaign_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute("SELECT id, status FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")
        db.execute("UPDATE campaigns SET status = 'completed', updated_at = ? WHERE id = ?",
                   (datetime.utcnow().isoformat(), campaign_id))
        log_activity(user["user_id"], user["user_name"], "complete_campaign", f"Completed campaign {campaign_id}")
        return {"message": "Campaign completed"}
