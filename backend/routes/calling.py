import os
import sys
import time
import random
import threading
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.database import get_db
from .auth import get_current_user, require_user

router = APIRouter(prefix="/api/calling", tags=["calling"])


class CallRequest(BaseModel):
    campaign_id: int
    agent_id: int
    phone_number: str
    customer_name: str = "there"
    lead_id: Optional[int] = None


class CallStatus(BaseModel):
    call_id: int
    status: str


_active_calls: dict[int, dict] = {}
_lock = threading.Lock()
_chat_sessions: dict[int, dict] = {}
_chat_lock = threading.Lock()
_CHAT_SILENCE_TIMEOUT = 20  # seconds

# Transfer management
_pending_transfers: dict[int, dict] = {}  # session_id -> transfer info
_transfer_lock = threading.Lock()
_TRANSFER_TIMEOUT = 120  # seconds - max time to wait for human to accept


# ============================================================
#  HELPER: Load campaign data + knowledge base for any call type
# ============================================================

def _load_campaign_kb(campaign_id: int) -> dict:
    """
    Load campaign settings (script, rebuttals) and knowledge base documents
    from the database. Returns a dict with:
      - campaign_script
      - campaign_rebuttals (dict or None)
      - kb_context (str, formatted KB docs)
    """
    result = {
        "campaign_script": None,
        "campaign_rebuttals": None,
        "kb_context": "",
    }
    with get_db() as db:
        row = db.execute(
            "SELECT script, rebuttals FROM campaigns WHERE id = ?",
            (campaign_id,),
        ).fetchone()
        if row:
            result["campaign_script"] = row["script"]
            try:
                import json
                result["campaign_rebuttals"] = json.loads(row["rebuttals"]) if row["rebuttals"] else None
            except:
                pass

        # Load knowledge base documents for this campaign
        docs = db.execute(
            "SELECT title, content FROM knowledge_documents WHERE campaign_id = ? ORDER BY created_at ASC",
            (campaign_id,),
        ).fetchall()
        if docs:
            kb_parts = []
            for d in docs:
                kb_parts.append(f"### {d['title']}\n{d['content']}")
            result["kb_context"] = "\n\n".join(kb_parts)

    return result


def _run_agent_call(call_id: int, campaign_id: int, agent_id: int, customer_name: str, lead_id: Optional[int] = None, session_id: Optional[int] = None, agent_name: Optional[str] = None, agent_voice: Optional[str] = None):
    try:
        import agent_campaign as ac

        with _lock:
            _active_calls[call_id] = {"status": "in_progress", "call_id": call_id}

        call_start = time.time()

        # Load campaign data + knowledge base for this call
        campaign_data = _load_campaign_kb(campaign_id)

        # Run the full voice call (speaker + mic via sounddevice)
        ac.run_call(
            customer_first_name=customer_name,
            agent_name=agent_name,
            agent_voice=agent_voice,
            campaign_script=campaign_data["campaign_script"],
            campaign_rebuttals=campaign_data["campaign_rebuttals"],
            kb_context=campaign_data["kb_context"],
        )

        duration = int(time.time() - call_start)

        outcome = "completed"
        age = None
        if ac.call_state.get("age_collected"):
            age = ac.call_state["age_collected"]
            if ac.call_state.get("call_transferred"):
                outcome = "transferred"
            else:
                outcome = "conversion"

        transcript = ac.get_transcript_text()

        # === TRANSFER FLOW ===
        # If the AI agent determined this lead should be transferred,
        # wait for a human to accept the transfer before finalizing
        if ac.call_state.get("call_transferred") and session_id:
            print(f"[Transfer] AI agent requested transfer for session {session_id}")
            
            # Register the pending transfer
            with _transfer_lock:
                _pending_transfers[session_id] = {
                    "call_id": call_id,
                    "campaign_id": campaign_id,
                    "agent_id": agent_id,
                    "lead_id": lead_id,
                    "customer_name": customer_name,
                    "session_id": session_id,
                    "status": "pending",  # pending -> accepted -> completed / declined
                    "created_at": time.time(),
                    "accepted_at": None,
                    "completed_at": None,
                    "human_messages": [],
                }

            # Update the chat session to reflect transfer state
            with _chat_lock:
                if session_id in _chat_sessions:
                    _chat_sessions[session_id]["call_ended"] = False  # Don't end yet
                    _chat_sessions[session_id]["transfer_pending"] = True
                    _chat_sessions[session_id]["transcript"] = transcript

            # Update DB: mark call as in_progress with transfer pending
            disposition_code = ac.call_state.get("vicidial_disposition", "XFER")
            with get_db() as db:
                db.execute(
                    "UPDATE calls SET status = 'in_progress', result = 'pending_transfer', disposition = ?, age_collected = ?, transcript = ?, duration_seconds = ? WHERE id = ?",
                    (disposition_code, age, transcript, duration, call_id),
                )
                if lead_id:
                    db.execute(
                        "UPDATE leads SET status = 'calling', call_result = 'pending_transfer', disposition = ?, age_collected = ? WHERE id = ?",
                        (disposition_code, age, lead_id),
                    )

            # Wait for human to accept the transfer (polling with timeout)
            wait_start = time.time()
            accepted = False
            while time.time() - wait_start < _TRANSFER_TIMEOUT:
                time.sleep(1)
                with _transfer_lock:
                    transfer = _pending_transfers.get(session_id)
                    if transfer is None:
                        break
                    if transfer["status"] == "accepted":
                        accepted = True
                        break
                    if transfer["status"] == "declined":
                        break
                    if transfer["status"] == "completed":
                        accepted = True
                        break

            if accepted:
                print(f"[Transfer] Human accepted transfer for session {session_id}")
                # Wait 3 seconds before the AI fully disconnects
                time.sleep(3)
                
                # Now the AI is done, human can communicate via chat
                # Update the session to let human talk
                with _chat_lock:
                    if session_id in _chat_sessions:
                        _chat_sessions[session_id]["call_ended"] = False
                        _chat_sessions[session_id]["transfer_pending"] = False
                        _chat_sessions[session_id]["transfer_accepted"] = True
                        _chat_sessions[session_id]["human_talking"] = True
                
                # Keep the call alive - human will complete when done
                # Don't finalize yet; wait for completion
                with _transfer_lock:
                    transfer = _pending_transfers.get(session_id)
                    if transfer:
                        transfer["accepted_at"] = time.time()
                
                # Wait for human to complete the transfer
                while time.time() - wait_start < _TRANSFER_TIMEOUT * 2:
                    time.sleep(2)
                    with _transfer_lock:
                        transfer = _pending_transfers.get(session_id)
                        if transfer is None:
                            break
                        if transfer["status"] == "completed":
                            break
                        if transfer["status"] == "declined":
                            break
                
                # Finalize - get the human transcript
                final_transcript = ac.get_transcript_text()
                with _transfer_lock:
                    transfer = _pending_transfers.get(session_id, {})
                    human_msgs = transfer.get("human_messages", [])
                
                # Append human messages to transcript
                for hm in human_msgs:
                    final_transcript += f"\nHuman Agent: {hm['message']}\nCustomer: {hm.get('response', '')}"
                
                # Mark call as transferred with final transcript
                outcome = "transferred"
                with _chat_lock:
                    if session_id in _chat_sessions:
                        _chat_sessions[session_id]["call_ended"] = True
                        _chat_sessions[session_id]["transcript"] = final_transcript
                
                transcript = final_transcript
            else:
                print(f"[Transfer] Transfer declined/timed out for session {session_id}")
                outcome = "conversion" if age else "declined"
                with _chat_lock:
                    if session_id in _chat_sessions:
                        _chat_sessions[session_id]["call_ended"] = True
                        _chat_sessions[session_id]["transfer_pending"] = False
                        _chat_sessions[session_id]["transcript"] = transcript

            # Clean up transfer
            with _transfer_lock:
                if session_id in _pending_transfers:
                    del _pending_transfers[session_id]

        # === NORMAL FLOW (no transfer) ===
        disposition_code = ac.call_state.get("vicidial_disposition", {
            "conversion": "XFER",
            "transferred": "XFER",
            "declined": "NI",
            "completed": "NI",
        }.get(outcome, "ERR"))
        with get_db() as db:
            db.execute(
                "UPDATE calls SET status = 'completed', result = ?, disposition = ?, age_collected = ?, outcome_text = ?, transcript = ?, duration_seconds = ? WHERE id = ?",
                (outcome, disposition_code, age, f"Call completed with {ac.CUSTOMER_NAME}", transcript, duration, call_id),
            )
            if lead_id:
                db.execute(
                    "UPDATE leads SET status = 'called', call_result = ?, disposition = ?, age_collected = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (outcome, disposition_code, age, lead_id),
                )
            db.execute(
                "UPDATE campaigns SET completed_count = completed_count + 1 WHERE id = ?",
                (campaign_id,),
            )
            if outcome == "conversion" or outcome == "transferred":
                db.execute(
                    "UPDATE campaigns SET conversion_count = conversion_count + 1 WHERE id = ?",
                    (campaign_id,),
                )
            db.execute(
                "UPDATE agents SET total_calls = total_calls + 1 WHERE id = ?",
                (agent_id,),
            )

        with _lock:
            _active_calls[call_id]["status"] = outcome

        # Mark session as ended if exists
        if session_id:
            with _chat_lock:
                if session_id in _chat_sessions:
                    _chat_sessions[session_id]["call_ended"] = True
                    _chat_sessions[session_id]["transcript"] = transcript

        # ============================================================
        #  AUTONOMOUS LEARNING — Post-Call Knowledge Base Enrichment
        # ============================================================
        # After the call is fully done, analyze what was learned and
        # store insights back into the campaign's knowledge base so
        # the agent gets smarter on future calls.
        try:
            if transcript and len(transcript) > 50:  # skip empty/trivial calls
                print(f"\n[LEARN] Starting post-call learning for campaign {campaign_id}...")
                ac.learn_and_update(transcript, campaign_id)
                print(f"[LEARN] Post-call learning complete for campaign {campaign_id}\n")
        except Exception as learn_err:
            print(f"[LEARN] Post-call learning failed: {learn_err}")

    except Exception as e:
        print(f"[CallAgent] Error: {e}")
        with get_db() as db:
            db.execute(
                "UPDATE calls SET status = 'failed', result = 'declined', disposition = 'ERR' WHERE id = ?",
                (call_id,),
            )
            if lead_id:
                db.execute(
                    "UPDATE leads SET status = 'failed', call_result = 'declined', disposition = 'ERR' WHERE id = ?",
                    (lead_id,),
                )
        with _lock:
            _active_calls[call_id]["status"] = "failed"
        if session_id:
            with _chat_lock:
                if session_id in _chat_sessions:
                    _chat_sessions[session_id]["call_ended"] = True
                    _chat_sessions[session_id]["error"] = str(e)


@router.post("/start-call")
def start_call(req: CallRequest, user: dict = Depends(require_user)):
    """Start an outbound voice call using the AI calling agent (sounddevice mic/speaker)."""
    # Load agent info
    agent_name = None
    agent_voice = None
    with get_db() as db:
        arow = db.execute("SELECT name, voice_type FROM agents WHERE id = ?", (req.agent_id,)).fetchone()
        if arow:
            agent_name = arow["name"]
            agent_voice = arow["voice_type"] if arow["voice_type"] else None

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result) "
            "VALUES (?, ?, ?, ?, 'in_progress', 'in_progress')",
            (req.campaign_id, req.agent_id, req.phone_number, req.customer_name),
        )
        call_id = cur.lastrowid

    thread = threading.Thread(
        target=_run_agent_call,
        args=(call_id, req.campaign_id, req.agent_id, req.customer_name),
        kwargs={"lead_id": req.lead_id, "agent_name": agent_name, "agent_voice": agent_voice},
        daemon=True,
    )
    thread.start()

    return {"call_id": call_id, "message": "Call started (voice mode)"}


@router.post("/recall/{lead_id}")
def recall_lead(lead_id: int, user: dict = Depends(require_user)):
    """Recall a previously called lead."""
    with get_db() as db:
        lead = db.execute(
            "SELECT l.*, c.agent_id FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE l.id = ?",
            (lead_id,),
        ).fetchone()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        lead_id_val = lead["id"]
        campaign_id = lead["campaign_id"]
        agent_id = lead["agent_id"]
        phone = lead["phone_number"]
        first_name = lead["first_name"] or "there"

    # Load agent info
    agent_name = None
    agent_voice = None
    with get_db() as db:
        arow = db.execute("SELECT name, voice_type FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if arow:
            agent_name = arow["name"]
            agent_voice = arow["voice_type"]

    with get_db() as db:
        db.execute(
            "UPDATE leads SET status = 'pending', call_result = NULL, age_collected = NULL WHERE id = ?",
            (lead_id_val,),
        )

        cur = db.execute(
            "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result) "
            "VALUES (?, ?, ?, ?, 'in_progress', 'in_progress')",
            (campaign_id, agent_id, phone, first_name),
        )
        call_id = cur.lastrowid

    thread = threading.Thread(
        target=_run_agent_call,
        args=(call_id, campaign_id, agent_id, first_name),
        kwargs={"lead_id": lead_id_val, "agent_name": agent_name, "agent_voice": agent_voice},
        daemon=True,
    )
    thread.start()

    return {"call_id": call_id, "lead_id": lead_id_val, "message": "Recall started"}


@router.post("/start-chat")
def start_chat(req: CallRequest, user: dict = Depends(require_user)):
    """Start a text-only chat session with the AI agent."""
    import agent_campaign as ac

    session_id = req.lead_id or int(time.time() * 1000) % 1000000

    # Load agent name & voice from DB
    agent_name = None
    agent_voice = None
    with get_db() as db:
        arow = db.execute("SELECT name, voice_type FROM agents WHERE id = ?", (req.agent_id,)).fetchone()
        if arow:
            agent_name = arow["name"]
            if arow["voice_type"]:
                agent_voice = arow["voice_type"]

    # Load campaign data + knowledge base for this chat
    campaign_data = _load_campaign_kb(req.campaign_id)

    ac.new_call_session(
        customer_first_name=req.customer_name,
        agent_name=agent_name,
        agent_voice=agent_voice,
        campaign_script=campaign_data["campaign_script"],
        campaign_rebuttals=campaign_data["campaign_rebuttals"],
        kb_context=campaign_data["kb_context"],
    )
    pitch = ac.PITCH_A  # same pitch every call (no random alternation)
    ac.history.append({"role": "assistant", "content": pitch})

    with _chat_lock:
        _chat_sessions[session_id] = {
            "customer_name": req.customer_name,
            "agent_name": ac.AGENT_NAME,
            "pitch": pitch,
            "call_ended": False,
            "last_activity": time.time(),
            "type": "text",
        }

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result) "
            "VALUES (?, ?, ?, ?, 'in_progress', 'in_progress')",
            (req.campaign_id, req.agent_id, req.phone_number, req.customer_name),
        )
        call_id = cur.lastrowid

    return {
        "session_id": session_id,
        "call_id": call_id,
        "agent_name": ac.AGENT_NAME,
        "pitch": pitch,
        "message": "Chat started",
    }


@router.post("/start-voice-chat")
def start_voice_chat(req: CallRequest, user: dict = Depends(require_user)):
    """
    Start a voice call + chat session.
    The AI agent speaks via TTS (speakers) and listens via mic (sounddevice).
    The chat shows the real-time transcript.
    """
    import agent_campaign as ac

    session_id = req.lead_id or int(time.time() * 1000) % 1000000

    # Create DB call record and mark lead as calling
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO calls (campaign_id, agent_id, phone_number, customer_name, status, result) "
            "VALUES (?, ?, ?, ?, 'in_progress', 'in_progress')",
            (req.campaign_id, req.agent_id, req.phone_number, req.customer_name),
        )
        call_id = cur.lastrowid
        if req.lead_id:
            db.execute(
                "UPDATE leads SET status = 'calling' WHERE id = ?",
                (req.lead_id,),
            )

    # Load agent name, voice & model from DB
    agent_name = None
    agent_voice = None
    with get_db() as db:
        arow = db.execute("SELECT name, voice_type FROM agents WHERE id = ?", (req.agent_id,)).fetchone()
        if arow:
            agent_name = arow["name"]
            if arow["voice_type"]:
                agent_voice = arow["voice_type"]

    # Load campaign data + knowledge base for this call
    campaign_data = _load_campaign_kb(req.campaign_id)

    # Initialize agent session with campaign-specific settings + KB
    ac.new_call_session(
        customer_first_name=req.customer_name,
        agent_name=agent_name,
        agent_voice=agent_voice,
        campaign_script=campaign_data["campaign_script"],
        campaign_rebuttals=campaign_data["campaign_rebuttals"],
        kb_context=campaign_data["kb_context"],
    )
    pitch = ac.PITCH_A  # single consistent pitch
    ac.history.append({"role": "assistant", "content": pitch})

    # Store session info
    with _chat_lock:
        _chat_sessions[session_id] = {
            "customer_name": req.customer_name,
            "agent_name": ac.AGENT_NAME,
            "pitch": pitch,
            "call_ended": False,
            "last_activity": time.time(),
            "type": "voice",
            "call_id": call_id,
            "campaign_id": req.campaign_id,
            "agent_id": req.agent_id,
            "phone_number": req.phone_number,
            "lead_id": req.lead_id,
        }

    # Start voice call in background thread with agent name & voice
    thread = threading.Thread(
        target=_run_agent_call,
        args=(call_id, req.campaign_id, req.agent_id, req.customer_name),
        kwargs={"lead_id": req.lead_id, "session_id": session_id,
                "agent_name": agent_name, "agent_voice": agent_voice},
        daemon=True,
    )
    thread.start()

    return {
        "session_id": session_id,
        "call_id": call_id,
        "agent_name": ac.AGENT_NAME,
        "pitch": pitch,
        "message": "Voice chat started - agent speaking via speakers, listening via mic. Transcript will appear in real-time.",
    }


class ChatMessage(BaseModel):
    session_id: int
    message: str
    campaign_id: int
    agent_id: int
    phone_number: str = ""
    customer_name: str = "there"
    lead_id: Optional[int] = None
    call_id: Optional[int] = None


@router.post("/send-message")
def send_chat_message(body: ChatMessage, user: dict = Depends(require_user)):
    import agent_campaign as ac

    # Check for silence timeout
    with _chat_lock:
        session = _chat_sessions.get(body.session_id)
        if session and not session.get("call_ended"):
            if time.time() - session["last_activity"] >= _CHAT_SILENCE_TIMEOUT:
                ac.call_state["call_ended"] = True
                reply = "This call will now end due to inactivity. Thank you for your time!"
                call_ended = True
                transcript = ac.get_transcript_text()
                if body.call_id:
                    with get_db() as db:
                        db.execute(
                            "UPDATE calls SET status = 'completed', result = 'declined', transcript = ? WHERE id = ?",
                            (transcript, body.call_id),
                        )
                session["call_ended"] = True
                return {"reply": reply, "call_ended": True, "transcript": transcript}

    reply = ac.process_text(body.message)

    if not reply:
        reply = "I'm sorry, could you say that again?"

    call_ended = ac.call_state.get("call_ended", False)
    transcript = ac.get_transcript_text()

    if body.call_id:
        with get_db() as db:
            outcome = "completed"
            age = ac.call_state.get("age_collected")
            if age:
                if ac.call_state.get("call_transferred"):
                    outcome = "transferred"
                else:
                    outcome = "conversion"
            db.execute(
                "UPDATE calls SET status = ?, result = ?, age_collected = ?, transcript = ? WHERE id = ?",
                ("completed" if call_ended else "in_progress", outcome, age, transcript, body.call_id),
            )
            if call_ended and body.lead_id:
                db.execute(
                    "UPDATE leads SET status = 'called', call_result = ?, age_collected = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (outcome, age, body.lead_id),
                )
            if call_ended:
                db.execute("UPDATE campaigns SET completed_count = completed_count + 1 WHERE id = ?", (body.campaign_id,))
                if outcome == "conversion" or outcome == "transferred":
                    db.execute("UPDATE campaigns SET conversion_count = conversion_count + 1 WHERE id = ?", (body.campaign_id,))

    with _chat_lock:
        if body.session_id in _chat_sessions:
            session = _chat_sessions[body.session_id]
            session["call_ended"] = call_ended
            session["last_activity"] = time.time()

    return {
        "reply": reply,
        "call_ended": call_ended,
        "transcript": transcript,
    }


@router.get("/transcript/{session_id}")
def get_transcript(session_id: int, since_index: int = Query(0, ge=0), user: dict = Depends(require_user)):
    """
    Get live transcript from an active voice call or chat session.
    Used by the frontend to poll for real-time updates.
    Returns new transcript lines since `since_index`.
    """
    import agent_campaign as ac

    transcript = ac.get_transcript_text()
    lines = transcript.split("\n") if transcript else []

    # Include human messages from transfer mode
    human_msgs_lines = []
    with _chat_lock:
        if session_id in _chat_sessions:
            for hm in _chat_sessions[session_id].get("human_messages", []):
                human_msgs_lines.append(f"Human Agent: {hm['text']}")
    
    all_lines = lines + human_msgs_lines
    new_lines = all_lines[since_index:] if since_index < len(all_lines) else []

    session_info = {}
    transfer_info = None
    with _chat_lock:
        if session_id in _chat_sessions:
            session_info = {
                "call_ended": _chat_sessions[session_id].get("call_ended", False),
                "agent_name": _chat_sessions[session_id].get("agent_name", "Agent"),
                "customer_name": _chat_sessions[session_id].get("customer_name", "there"),
                "session_type": _chat_sessions[session_id].get("type", "text"),
                "transfer_pending": _chat_sessions[session_id].get("transfer_pending", False),
                "transfer_accepted": _chat_sessions[session_id].get("transfer_accepted", False),
                "human_talking": _chat_sessions[session_id].get("human_talking", False),
            }

    with _transfer_lock:
        if session_id in _pending_transfers:
            t = _pending_transfers[session_id]
            transfer_info = {
                "status": t["status"],
                "customer_name": t["customer_name"],
                "created_at": t["created_at"],
                "call_id": t["call_id"],
            }

    call_ended = session_info.get("call_ended", ac.call_state.get("call_ended", False))

    return {
        "lines": new_lines,
        "total_lines": len(all_lines),
        "since_index": since_index,
        "call_ended": call_ended,
        "session": session_info,
        "transfer": transfer_info,
    }


@router.get("/active-calls")
def get_active_calls(user: dict = Depends(require_user)):
    with _lock:
        return list(_active_calls.values())


@router.get("/status/{call_id}")
def get_call_status(call_id: int, user: dict = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT id, status, result FROM calls WHERE id = ?", (call_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Call not found")
        return dict(row)


# ============================================================
#  TRANSFER ENDPOINTS
# ============================================================

class TransferAction(BaseModel):
    session_id: int


@router.get("/pending-transfers")
def get_pending_transfers(_: dict = Depends(require_user)):
    """Get all pending transfer requests for the human agent."""
    now = time.time()
    transfers = []
    with _transfer_lock:
        for sid, t in _pending_transfers.items():
            if t["status"] in ("pending", "accepted") and (now - t["created_at"]) < _TRANSFER_TIMEOUT * 2:
                transfers.append({
                    "session_id": sid,
                    "customer_name": t["customer_name"],
                    "status": t["status"],
                    "created_at": t["created_at"],
                    "call_id": t["call_id"],
                    "campaign_id": t["campaign_id"],
                })
    return transfers


@router.post("/accept-transfer")
def accept_transfer(body: TransferAction, user: dict = Depends(require_user)):
    """Accept a pending transfer. The AI will disconnect and the human can take over."""
    with _transfer_lock:
        if body.session_id not in _pending_transfers:
            raise HTTPException(status_code=404, detail="Transfer not found")
        t = _pending_transfers[body.session_id]
        if t["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Transfer already {t['status']}")
        t["status"] = "accepted"
        t["accepted_at"] = time.time()

    # Update session to show accepted
    with _chat_lock:
        if body.session_id in _chat_sessions:
            _chat_sessions[body.session_id]["transfer_pending"] = False
            _chat_sessions[body.session_id]["transfer_accepted"] = True

    return {
        "message": "Transfer accepted. AI will disconnect in 3 seconds. You can now talk to the customer.",
        "session_id": body.session_id,
        "customer_name": t["customer_name"],
    }


@router.post("/decline-transfer")
def decline_transfer(body: TransferAction, user: dict = Depends(require_user)):
    """Decline a pending transfer. The call will end normally."""
    with _transfer_lock:
        if body.session_id not in _pending_transfers:
            raise HTTPException(status_code=404, detail="Transfer not found")
        t = _pending_transfers[body.session_id]
        t["status"] = "declined"

    with _chat_lock:
        if body.session_id in _chat_sessions:
            _chat_sessions[body.session_id]["transfer_pending"] = False
            _chat_sessions[body.session_id]["call_ended"] = True

    return {"message": "Transfer declined. Call will end.", "session_id": body.session_id}


@router.post("/complete-transfer")
def complete_transfer(body: TransferAction, user: dict = Depends(require_user)):
    """Complete the transfer - the human is done talking to the client."""
    with _transfer_lock:
        if body.session_id not in _pending_transfers:
            raise HTTPException(status_code=404, detail="Transfer not found")
        t = _pending_transfers[body.session_id]
        t["status"] = "completed"
        t["completed_at"] = time.time()

    with _chat_lock:
        if body.session_id in _chat_sessions:
            _chat_sessions[body.session_id]["human_talking"] = False
            _chat_sessions[body.session_id]["call_ended"] = True

    return {"message": "Transfer completed. Call is ending.", "session_id": body.session_id}


@router.post("/send-human-message")
def send_human_message(body: ChatMessage, user: dict = Depends(require_user)):
    """
    Send a message from the human agent to the customer during a transfer.
    This bypasses the AI and directly sends the human's message.
    """
    with _transfer_lock:
        if body.session_id not in _pending_transfers:
            raise HTTPException(status_code=404, detail="No active transfer for this session")
        t = _pending_transfers[body.session_id]
        if t["status"] not in ("accepted", "completed"):
            raise HTTPException(status_code=400, detail=f"Transfer in state '{t['status']}' - cannot send message")
        
        # Store the human message
        t["human_messages"].append({
            "message": body.message,
            "timestamp": time.time(),
            "user_id": user["user_id"],
            "user_name": user["user_name"],
        })

    # Also add to chat session for transcript
    with _chat_lock:
        if body.session_id in _chat_sessions:
            if "human_messages" not in _chat_sessions[body.session_id]:
                _chat_sessions[body.session_id]["human_messages"] = []
            _chat_sessions[body.session_id]["human_messages"].append({
                "role": "human_agent",
                "text": body.message,
            })

    return {
        "reply": body.message,
        "call_ended": False,
        "transcript": None,
        "is_human": True,
    }


class StopCallRequest(BaseModel):
    session_id: Optional[int] = None
    call_id: Optional[int] = None
    lead_id: Optional[int] = None
    campaign_id: Optional[int] = None


@router.post("/stop-call")
def stop_call(body: StopCallRequest, user: dict = Depends(require_user)):
    """Immediately stop an active call — ends the AI agent and updates DB records."""
    import agent_campaign as ac

    # End the AI agent's call loop
    ac.call_state["call_ended"] = True
    transcript = ac.get_transcript_text()

    # Update DB call record if call_id provided
    if body.call_id:
        with get_db() as db:
            db.execute(
                "UPDATE calls SET status = 'completed', result = 'declined', transcript = ? WHERE id = ?",
                (transcript, body.call_id),
            )

    # Update lead status
    if body.lead_id:
        with get_db() as db:
            db.execute(
                "UPDATE leads SET status = 'called', call_result = 'declined', called_at = CURRENT_TIMESTAMP WHERE id = ?",
                (body.lead_id,),
            )

    # Increment campaign completed count
    if body.campaign_id:
        with get_db() as db:
            db.execute("UPDATE campaigns SET completed_count = completed_count + 1 WHERE id = ?", (body.campaign_id,))

    # Mark chat session as ended
    if body.session_id:
        with _chat_lock:
            if body.session_id in _chat_sessions:
                _chat_sessions[body.session_id]["call_ended"] = True

    return {
        "message": "Call stopped",
        "call_ended": True,
        "transcript": transcript,
    }


class LearningRequest(BaseModel):
    call_id: int
    campaign_id: int


@router.post("/learn/{call_id}")
def trigger_learning(call_id: int, campaign_id: int = None, user: dict = Depends(require_user)):
    """
    Manually trigger post-call learning for a specific call.
    Analyzes the call transcript and enriches the campaign's knowledge base.
    If campaign_id is not provided, it's loaded from the call record.
    """
    import agent_campaign as ac

    # Load the call transcript
    with get_db() as db:
        row = db.execute(
            "SELECT id, campaign_id, transcript FROM calls WHERE id = ?",
            (call_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Call not found")

        cid = campaign_id or row["campaign_id"]
        transcript = row["transcript"] or ""

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Call has no transcript")

    # Run the learning pipeline
    insights = ac.learn_and_update(transcript, cid)

    if "error" in insights:
        return {
            "message": "Learning completed with issues",
            "call_id": call_id,
            "campaign_id": cid,
            "error": insights["error"],
            "insights": {},
        }

    # Count what was saved
    kb_count = len(insights.get("new_knowledge", []))
    rebuttal_count = len(insights.get("suggested_rebuttals", {}))

    return {
        "message": f"Learning complete. Added {kb_count} knowledge items and {rebuttal_count} rebuttal suggestions.",
        "call_id": call_id,
        "campaign_id": cid,
        "objections": insights.get("objections_raised", []),
        "new_knowledge": insights.get("new_knowledge", []),
        "suggested_rebuttals": insights.get("suggested_rebuttals", {}),
        "summary": insights.get("summary", ""),
    }
