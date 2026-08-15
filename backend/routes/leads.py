import csv
import io
import os
import sys
import threading
import time

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.database import get_db
from .auth import get_current_user, require_user
from ..auth import log_activity

router = APIRouter(prefix="/api/leads", tags=["leads"])

_dialer_state: dict[int, dict] = {}
_dialer_lock = threading.Lock()


class LeadCreate(BaseModel):
    campaign_id: int
    phone_number: str
    first_name: str = ""
    last_name: str = ""


class LeadsImport(BaseModel):
    campaign_id: int
    leads: List[LeadCreate]


@router.get("")
def list_leads(campaign_id: Optional[int] = None, status: Optional[str] = None, limit: int = 500, user: dict = Depends(require_user)):
    with get_db() as db:
        query = "SELECT l.*, c.name as campaign_name FROM leads l LEFT JOIN campaigns c ON l.campaign_id = c.id WHERE 1=1"
        params = []
        if campaign_id is not None:
            query += " AND l.campaign_id = ?"
            params.append(campaign_id)
        if status:
            query += " AND l.status = ?"
            params.append(status)
        query += " ORDER BY l.created_at DESC LIMIT ?"
        params.append(limit)
        rows = db.execute(query, params).fetchall()
        return [dict(r) for r in rows]


@router.get("/queue")
def dialer_queue(campaign_id: int, user: dict = Depends(require_user)):
    """Get pending leads for a campaign that are ready to be called."""
    with get_db() as db:
        rows = db.execute(
            "SELECT l.*, c.name as campaign_name, a.id as agent_id, a.name as agent_name "
            "FROM leads l "
            "JOIN campaigns c ON l.campaign_id = c.id "
            "JOIN agents a ON c.agent_id = a.id "
            "WHERE l.campaign_id = ? AND l.status = 'pending' "
            "ORDER BY l.created_at ASC LIMIT 100",
            (campaign_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("")
def create_lead(body: LeadCreate, user: dict = Depends(require_user)):
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM leads WHERE campaign_id = ? AND phone_number = ?",
            (body.campaign_id, body.phone_number),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Lead already exists in this campaign")

        cur = db.execute(
            "INSERT INTO leads (campaign_id, phone_number, first_name, last_name) VALUES (?, ?, ?, ?)",
            (body.campaign_id, body.phone_number, body.first_name, body.last_name),
        )
        db.execute("UPDATE campaigns SET target_count = target_count + 1 WHERE id = ?", (body.campaign_id,))
        return {"id": cur.lastrowid, "message": "Lead added"}


@router.post("/import")
def import_leads(body: LeadsImport, user: dict = Depends(require_user)):
    with get_db() as db:
        count = 0
        for lead in body.leads:
            existing = db.execute(
                "SELECT id FROM leads WHERE campaign_id = ? AND phone_number = ?",
                (body.campaign_id, lead.phone_number),
            ).fetchone()
            if existing:
                continue
            db.execute(
                "INSERT INTO leads (campaign_id, phone_number, first_name, last_name) VALUES (?, ?, ?, ?)",
                (body.campaign_id, lead.phone_number, lead.first_name, lead.last_name),
            )
            count += 1
        db.execute("UPDATE campaigns SET target_count = target_count + ? WHERE id = ?", (count, body.campaign_id))
        return {"imported": count, "message": f"{count} leads imported"}


@router.post("/upload-csv")
async def upload_csv(campaign_id: int = Form(...), file: UploadFile = File(...), user: dict = Depends(require_user)):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    with get_db() as db:
        count = 0
        for row in reader:
            phone = row.get("phone") or row.get("phone_number") or row.get("Phone") or ""
            first = row.get("first_name") or row.get("first") or row.get("FirstName") or ""
            last = row.get("last_name") or row.get("last") or row.get("LastName") or ""
            if not phone:
                continue
            phone = phone.strip()
            if not phone:
                continue

            existing = db.execute(
                "SELECT id FROM leads WHERE campaign_id = ? AND phone_number = ?",
                (campaign_id, phone),
            ).fetchone()
            if existing:
                continue
            db.execute(
                "INSERT INTO leads (campaign_id, phone_number, first_name, last_name) VALUES (?, ?, ?, ?)",
                (campaign_id, phone, first, last),
            )
            count += 1
        db.execute("UPDATE campaigns SET target_count = target_count + ? WHERE id = ?", (count, campaign_id))
        return {"imported": count, "message": f"{count} leads imported from CSV"}


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        lead = db.execute("SELECT campaign_id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        db.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
        db.execute("UPDATE campaigns SET target_count = MAX(0, target_count - 1) WHERE id = ?", (lead["campaign_id"],))
        return {"message": "Lead deleted"}


def _process_queue(campaign_id: int, agent_id: int):
    """Background worker that processes leads sequentially."""
    with _dialer_lock:
        if _dialer_state.get(campaign_id, {}).get("active"):
            return
        _dialer_state[campaign_id] = {"active": True, "completed": 0, "total": 0}

    try:
        from agent_campaign import run_call, call_state, new_call_session, get_transcript_text

        with get_db() as db:
            total = db.execute(
                "SELECT COUNT(*) as cnt FROM leads WHERE campaign_id = ? AND status = 'pending'",
                (campaign_id,),
            ).fetchone()["cnt"]
            with _dialer_lock:
                _dialer_state[campaign_id]["total"] = total

        while True:
            with _dialer_lock:
                if not _dialer_state.get(campaign_id, {}).get("active"):
                    break

            with get_db() as db:
                lead = db.execute(
                    "SELECT * FROM leads WHERE campaign_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
                    (campaign_id,),
                ).fetchone()

            if not lead:
                break

            lead_id = lead["id"]
            first_name = lead["first_name"] or "there"
            phone = lead["phone_number"]

            with get_db() as db:
                db.execute(
                    "UPDATE leads SET status = 'calling' WHERE id = ?",
                    (lead_id,),
                )

            print(f"\n[Dialer] Calling {first_name} at {phone}...")
            try:
                # Load campaign knowledge base for this call
                kb_context = ""
                campaign_script = None
                campaign_rebuttals = None
                with get_db() as db:
                    row = db.execute("SELECT script, rebuttals FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
                    if row:
                        campaign_script = row["script"]
                        try:
                            import json
                            campaign_rebuttals = json.loads(row["rebuttals"]) if row["rebuttals"] else None
                        except:
                            pass
                    docs = db.execute(
                        "SELECT title, content FROM knowledge_documents WHERE campaign_id = ? ORDER BY created_at ASC",
                        (campaign_id,),
                    ).fetchall()
                    if docs:
                        parts = [f"### {d['title']}\n{d['content']}" for d in docs]
                        kb_context = "\n\n".join(parts)

                new_call_session(
                    customer_first_name=first_name,
                    campaign_script=campaign_script,
                    campaign_rebuttals=campaign_rebuttals,
                    kb_context=kb_context,
                )
                run_call(customer_first_name=first_name)

                age = call_state.get("age_collected")
                outcome = "conversion" if age else "declined"
                transcript = get_transcript_text()

                with get_db() as db:
                    db.execute(
                        "UPDATE leads SET status = 'called', call_result = ?, age_collected = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (outcome, age, lead_id),
                    )
                    db.execute(
                        "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result, duration_seconds, age_collected, transcript) "
                        "VALUES (?, ?, ?, ?, 'completed', ?, 0, ?, ?)",
                        (campaign_id, agent_id, phone, first_name, outcome, age, transcript),
                    )
                    db.execute(
                        "UPDATE campaigns SET completed_count = completed_count + 1 WHERE id = ?",
                        (campaign_id,),
                    )
                    if outcome == "conversion":
                        db.execute(
                            "UPDATE campaigns SET conversion_count = conversion_count + 1 WHERE id = ?",
                            (campaign_id,),
                        )

            except Exception as e:
                print(f"[Dialer] Error on lead {lead_id}: {e}")
                with get_db() as db:
                    db.execute(
                        "UPDATE leads SET status = 'failed' WHERE id = ?",
                        (lead_id,),
                    )

            with _dialer_lock:
                _dialer_state[campaign_id]["completed"] += 1

    finally:
        with _dialer_lock:
            if campaign_id in _dialer_state:
                _dialer_state[campaign_id]["active"] = False


@router.post("/dial/{campaign_id}")
def start_dialer(campaign_id: int, user: dict = Depends(require_user)):
    """Start dialing all pending leads in a campaign sequentially."""
    with get_db() as db:
        campaign = db.execute(
            "SELECT * FROM campaigns WHERE id = ?", (campaign_id,)
        ).fetchone()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

        pending = db.execute(
            "SELECT COUNT(*) as cnt FROM leads WHERE campaign_id = ? AND status = 'pending'",
            (campaign_id,),
        ).fetchone()["cnt"]
        if pending == 0:
            return {"message": "No pending leads to call"}

        thread = threading.Thread(
            target=_process_queue,
            args=(campaign_id, campaign["agent_id"]),
            daemon=True,
        )
        thread.start()

        return {"message": f"Dialer started for {pending} leads (Local audio)"}


@router.post("/stop/{campaign_id}")
def stop_dialer(campaign_id: int, user: dict = Depends(require_user)):
    with _dialer_lock:
        if campaign_id in _dialer_state:
            _dialer_state[campaign_id]["active"] = False
    return {"message": "Dialer stopping"}


@router.get("/export-csv")
def export_leads_csv(campaign_id: Optional[int] = None, status: Optional[str] = None, user: dict = Depends(require_user)):
    """Export leads as CSV file."""
    from fastapi.responses import StreamingResponse
    from ..dispositions import get_disposition

    with get_db() as db:
        query = """
            SELECT l.id, l.phone_number, l.first_name, l.last_name, l.status,
                   l.call_result, l.disposition, l.age_collected, l.notes,
                   l.created_at, l.called_at, c.name as campaign_name
            FROM leads l LEFT JOIN campaigns c ON l.campaign_id = c.id WHERE 1=1
        """
        params = []
        if campaign_id is not None:
            query += " AND l.campaign_id = ?"
            params.append(campaign_id)
        if status:
            query += " AND l.status = ?"
            params.append(status)
        query += " ORDER BY l.created_at DESC"

        rows = db.execute(query, params).fetchall()

    def generate():
        import csv, io
        output = io.StringIO()
        writer = csv.writer(output)
        # Header
        writer.writerow(["ID", "Phone", "First Name", "Last Name", "Status",
                         "Call Result", "Disposition", "Disposition Label",
                         "Age", "Notes", "Created", "Called", "Campaign"])
        for r in rows:
            d = dict(r)
            disp_info = get_disposition(d.get("disposition") or "")
            writer.writerow([
                d["id"], d["phone_number"], d["first_name"], d["last_name"],
                d["status"], d["call_result"], d.get("disposition", ""),
                disp_info["label"], d["age_collected"], d["notes"],
                d["created_at"], d.get("called_at", ""), d.get("campaign_name", ""),
            ])
        yield output.getvalue()

    filename = f"leads_export_{campaign_id or 'all'}_{int(time.time())}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/dialer-status/{campaign_id}")
def dialer_status(campaign_id: int, user: dict = Depends(require_user)):
    with _dialer_lock:
        state = _dialer_state.get(campaign_id, {"active": False, "completed": 0, "total": 0})
    with get_db() as db:
        pending = db.execute(
            "SELECT COUNT(*) as cnt FROM leads WHERE campaign_id = ? AND status = 'pending'",
            (campaign_id,),
        ).fetchone()["cnt"]
        called = db.execute(
            "SELECT COUNT(*) as cnt FROM leads WHERE campaign_id = ? AND status = 'called'",
            (campaign_id,),
        ).fetchone()["cnt"]
        conversions = db.execute(
            "SELECT COUNT(*) as cnt FROM leads WHERE campaign_id = ? AND call_result = 'conversion'",
            (campaign_id,),
        ).fetchone()["cnt"]
    return {
        **state,
        "pending": pending,
        "called": called,
        "conversions": conversions,
    }
