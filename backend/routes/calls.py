import csv
import io
import time
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from .auth import get_current_user, require_user
from ..auth import log_activity
from ..dispositions import get_disposition

router = APIRouter(prefix="/api/calls", tags=["calls"])


class CallLogCreate(BaseModel):
    campaign_id: int
    agent_id: int
    phone_number: str
    customer_name: str = ""
    status: str = "in_progress"
    result: str = "in_progress"
    duration_seconds: int = 0
    age_collected: Optional[int] = None
    outcome_text: Optional[str] = None


@router.get("")
def list_calls(campaign_id: Optional[int] = Query(None), limit: int = Query(50), user: dict = Depends(require_user)):
    with get_db() as db:
        if campaign_id:
            rows = db.execute(
                "SELECT c.*, a.name as agent_name FROM calls c LEFT JOIN agents a ON c.agent_id = a.id WHERE c.campaign_id = ? ORDER BY c.created_at DESC LIMIT ?",
                (campaign_id, limit),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT c.*, a.name as agent_name FROM calls c LEFT JOIN agents a ON c.agent_id = a.id ORDER BY c.created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


@router.get("/export-csv")
def export_calls_csv(campaign_id: Optional[int] = Query(None), user: dict = Depends(require_user)):
    """Export calls as CSV file."""
    with get_db() as db:
        query = """
            SELECT c.id, c.phone_number, c.customer_name, c.status, c.result,
                   c.disposition, c.age_collected, c.outcome_text, c.duration_seconds,
                   c.transcript, c.created_at, a.name as agent_name, ca.name as campaign_name
            FROM calls c
            LEFT JOIN agents a ON c.agent_id = a.id
            LEFT JOIN campaigns ca ON c.campaign_id = ca.id
            WHERE 1=1
        """
        params = []
        if campaign_id is not None:
            query += " AND c.campaign_id = ?"
            params.append(campaign_id)
        query += " ORDER BY c.created_at DESC"
        rows = db.execute(query, params).fetchall()

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Phone", "Customer Name", "Status", "Result",
                         "Disposition", "Disposition Label", "Age", "Outcome",
                         "Duration (s)", "Created", "Agent", "Campaign"])
        for r in rows:
            d = dict(r)
            disp_info = get_disposition(d.get("disposition") or "")
            writer.writerow([
                d["id"], d["phone_number"], d["customer_name"],
                d["status"], d["result"], d.get("disposition", ""),
                disp_info["label"], d["age_collected"], d["outcome_text"],
                d["duration_seconds"], d["created_at"],
                d.get("agent_name", ""), d.get("campaign_name", ""),
            ])
        yield output.getvalue()

    filename = f"calls_export_{campaign_id or 'all'}_{int(time.time())}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/recent")
def recent_calls(limit: int = Query(10), user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT c.*, a.name as agent_name FROM calls c LEFT JOIN agents a ON c.agent_id = a.id ORDER BY c.created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{call_id}")
def get_call(call_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT c.*, a.name as agent_name FROM calls c LEFT JOIN agents a ON c.agent_id = a.id WHERE c.id = ?",
            (call_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Call not found")
        return dict(row)


@router.post("")
def log_call(body: CallLogCreate, user: dict = Depends(require_user)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result, duration_seconds, age_collected, outcome_text) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (body.campaign_id, body.agent_id, body.phone_number, body.customer_name,
             body.status, body.result, body.duration_seconds, body.age_collected, body.outcome_text),
        )

        if body.result in ("conversion", "declined", "completed"):
            db.execute(
                "UPDATE campaigns SET completed_count = completed_count + 1, updated_at = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), body.campaign_id),
            )
            db.execute(
                "UPDATE agents SET total_calls = total_calls + 1 WHERE id = ?",
                (body.agent_id,),
            )
            if body.result == "conversion":
                db.execute(
                    "UPDATE campaigns SET conversion_count = conversion_count + 1, updated_at = ? WHERE id = ?",
                    (datetime.utcnow().isoformat(), body.campaign_id),
                )

        log_activity(user["user_id"], user["user_name"], "log_call", f"Logged call for campaign {body.campaign_id}")
        return {"id": cur.lastrowid, "message": "Call logged"}
