"""
VICIdial Integration Routes
===========================
Provides the API endpoints for the VICIdial ↔ Empire-X integration.

Architecture Overview:
  VICIdial (Dialer + Human Agents)
      │
      │  Auto-dials leads from its campaigns
      │  When answered → runs AGI script
      ▼
  Empire-X AGI Handler (backend/agi_handler.py)
      │
      │  Bridges audio between the lead and our AI agent
      │  Sends call events to these endpoints
      ▼
  Empire-X Backend (these routes)
      │
      │  Manages AI sessions, processes audio, makes transfer decisions
      │  Communicates with the running AI agent via agent_campaign.py
      ▼
  Empire-X AI Agent (agent_campaign.py)
      │
      │  Groq LLM + Edge-TTS + STT
      │  Determines if lead qualifies
      ▼
  Decision: Transfer OR Hangup
      │                     │
      ▼                     ▼
  VICIdial Human      VICIdial Disposition
  Agent Queue         (Not Interested / Declined)

Flow Detail:
  1. VICIdial auto-dials a number from its campaign list
  2. When answered, VICIdial runs the AGI script (agi://empire-server:4573)
  3. AGI script sends a callback to /api/vicidial/agi-start-call
  4. This route starts an agent_campaign.py session for the call
  5. AGI script polls /api/vicidial/agi-next-response for AI text
  6. AI text is converted to audio (via TTS) and played to the lead
  7. Lead's response is recorded and sent to /api/vicidial/agi-process-audio
  8. The audio is transcribed (STT) and fed to the Groq LLM
  9. LLM response is returned as text to the AGI script
  10. Loop continues until the AI decides to transfer or end the call
  11. If transfer: AI tells AGI to transfer call to VICIdial queue
  12. A human agent in VICIdial picks up the transferred call
  13. If hangup: disposition is set in VICIdial

Key Features:
  - Lead sync: Empire-X ↔ VICIdial (bidirectional)
  - AGI callback handling for direct call bridging
  - Transfer decision management
  - Session tracking with VICIdial call IDs
  - Configurable agent and queue mapping
"""

import os
import sys
import json
import time
import threading
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from pydantic import BaseModel
import requests

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.database import get_db, get_vicidial_config, set_vicidial_config
from .auth import get_current_user, require_user
from ..auth import log_activity

# ============================================================
#  Router Setup
# ============================================================

router = APIRouter(prefix="/api/vicidial", tags=["vicidial"])

# ============================================================
#  Dynamic Helpers (reads from DB — changes take effect instantly)
# ============================================================

def _cfg(key: str, default: str = None) -> str:
    """Get a VICIdial config value from database dynamically."""
    return get_vicidial_config(key, default) or os.getenv(f"VICIDIAL_{key.upper()}", "") or default or ""


def _get_tts_url() -> str:
    return os.getenv("TTS_API_URL", "http://localhost:8000/tts")


def _get_callback_secret() -> str:
    return os.getenv("EMPIRE_CALLBACK_KEY", "empire_secret_callback_key")


def _get_all_config() -> dict:
    """Get ALL VICIdial config from DB as a flat dict."""
    db_config = get_vicidial_config() or {}
    # Cast boolean-ish values
    for k in ("connected",):
        if k in db_config:
            db_config[k] = db_config[k].lower() == "true"
    return db_config


# ============================================================
#  In-Memory Session Store
# ============================================================

_vicidial_sessions: dict[str, dict] = {}  # call_id -> session info
_vicidial_lock = threading.Lock()


# ============================================================
#  Pydantic Models
# ============================================================

class VICIdialConfigUpdate(BaseModel):
    api_url: Optional[str] = None
    api_user: Optional[str] = None
    api_pass: Optional[str] = None
    agent_user: Optional[str] = None
    agent_pass: Optional[str] = None
    campaign_id: Optional[str] = None
    default_queue: Optional[str] = None
    server_ip: Optional[str] = None
    server_url: Optional[str] = None  # frontend-friendly alias for server_ip
    transfer_mode: Optional[str] = None  # "internal" or "sip_refer"
    mode: Optional[str] = None  # "local" or "vicidial"


class AGICallStartRequest(BaseModel):
    """Callback from AGI script when a call is answered."""
    call_id: str
    phone_number: str
    customer_name: str = "there"
    lead_id: str = ""
    campaign_id: str = ""
    secret: str = ""


class AGIAudioProcessRequest(BaseModel):
    """Process recorded audio from AGI."""
    pass  # Audio file is uploaded as multipart


class LeadSyncRequest(BaseModel):
    """Sync leads from Empire-X to VICIdial."""
    campaign_id: Optional[str] = None
    leads: list


class LeadSyncResponse(BaseModel):
    imported: int = 0
    failed: int = 0
    errors: list = []


# ============================================================
#  Helpers
# ============================================================

def _verify_callback_secret(secret: str):
    """Verify AGI callback request is authentic."""
    expected = _get_callback_secret()
    if secret != expected:
        raise HTTPException(status_code=403, detail="Invalid callback secret")


def _setup_vicidial_client_env():
    """
    Sync DB config to environment variables before calling VICIdial client.
    This is needed because the vicidial_client module reads from os.environ.
    """
    db_config = get_vicidial_config() or {}
    env_map = {
        "api_url": "VICIDIAL_API_URL",
        "api_user": "VICIDIAL_API_USER",
        "api_pass": "VICIDIAL_API_PASS",
        "agent_user": "VICIDIAL_AGENT_USER",
        "agent_pass": "VICIDIAL_AGENT_PASS",
        "campaign_id": "VICIDIAL_CAMPAIGN_ID",
        "default_queue": "VICIDIAL_DEFAULT_QUEUE",
        "server_ip": "VICIDIAL_SERVER_IP",
    }
    for db_key, env_key in env_map.items():
        if db_key in db_config and db_config[db_key]:
            os.environ[env_key] = db_config[db_key]


def _get_vicidial_client():
    """Get the VICIdial API client module (lazy import + dynamic env)."""
    _setup_vicidial_client_env()
    from backend.vicidial_client import (
        add_lead, update_lead, list_leads,
        agent_login, agent_logout, agent_pause, agent_unpause,
        transfer_call, call_disposition, get_agent_status,
        start_campaign, stop_campaign, get_campaign_status,
        check_connection, verify_api_credentials, sync_leads_from_empire,
        VICIdialError,
    )
    return {
        "add_lead": add_lead,
        "update_lead": update_lead,
        "list_leads": list_leads,
        "agent_login": agent_login,
        "agent_logout": agent_logout,
        "agent_pause": agent_pause,
        "agent_unpause": agent_unpause,
        "transfer_call": transfer_call,
        "call_disposition": call_disposition,
        "get_agent_status": get_agent_status,
        "start_campaign": start_campaign,
        "stop_campaign": stop_campaign,
        "get_campaign_status": get_campaign_status,
        "check_connection": check_connection,
        "verify_api_credentials": verify_api_credentials,
        "sync_leads_from_empire": sync_leads_from_empire,
        "VICIdialError": VICIdialError,
    }


def _init_ai_session(call_id: str, phone_number: str, customer_name: str,
                      lead_id: str = "", campaign_id: str = "") -> dict:
    """
    Initialize an agent_campaign.py session for a VICIdial call.
    This is the bridge between VICIdial and the Empire-X AI agent.
    """
    try:
        import agent_campaign as ac

        # Load agent voice from DB (use first active agent as default for VICIdial)
        agent_voice = None
        with get_db() as db:
            arow = db.execute("SELECT voice_type FROM agents WHERE status = 'active' LIMIT 1").fetchone()
            if arow and arow["voice_type"]:
                agent_voice = arow["voice_type"]

        # Load campaign script, rebuttals & knowledge base docs from DB
        campaign_script = None
        campaign_rebuttals = None
        kb_context = ""
        if campaign_id:
            with get_db() as db:
                row = db.execute("SELECT script, rebuttals FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
                if row:
                    campaign_script = row["script"]
                    try:
                        import json
                        campaign_rebuttals = json.loads(row["rebuttals"]) if row["rebuttals"] else None
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
                    kb_context = "\n\n".join(kb_parts)
        # Start a fresh call session with campaign-specific script, voice & knowledge base
        ac.new_call_session(
            customer_first_name=customer_name,
            agent_name=agent_name,
            campaign_script=campaign_script,
            campaign_rebuttals=campaign_rebuttals,
            kb_context=kb_context,
            agent_voice=agent_voice,
        )

        # Single consistent pitch (no random alternation)
        pitch = ac.PITCH_A
        ac.history.append({"role": "assistant", "content": pitch})

        with _vicidial_lock:
            _vicidial_sessions[call_id] = {
                "call_id": call_id,
                "phone_number": phone_number,
                "customer_name": customer_name,
                "lead_id": lead_id,
                "campaign_id": campaign_id,
                "started_at": time.time(),
                "call_ended": False,
                "call_transferred": False,
                "age_collected": None,
                "pitch": pitch,
                "current_turn": 0,
                "agent_name": ac.AGENT_NAME,
                "last_ai_text": pitch,
                "needs_processing": False,
                "process_queue": [],  # Queue of lead audio to process
                "transfer_destination": None,
                "disposition": None,
            }

        log_activity(
            user_id=1,
            user_name="VICIdial",
            action="vicidial_call_started",
            details=f"VICIdial call {call_id} from {phone_number} ({customer_name})",
            ip_address="",
        )

        return {
            "session_id": call_id,
            "agent_name": ac.AGENT_NAME,
            "pitch": pitch,
            "call_id": call_id,
        }

    except Exception as e:
        print(f"[VICIdial] AI session init error: {e}")
        return {"error": str(e)}


def _get_next_ai_text(call_id: str) -> dict:
    """
    Get the next AI response for a VICIdial call.
    Called by the AGI script to get the next text to speak.
    """
    import agent_campaign as ac

    with _vicidial_lock:
        session = _vicidial_sessions.get(call_id)
        if not session:
            return {"error": "Session not found", "call_ended": True}

        # Check if there's a queued response
        if session["process_queue"]:
            lead_text = session["process_queue"].pop(0)
        else:
            try:
                # Try to get LLM response for any pending input
                if session.get("pending_input"):
                    reply = ac.process_text(session["pending_input"])
                    session["pending_input"] = None
                    if reply:
                        session["last_ai_text"] = reply
                        session["current_turn"] += 1

                        # Check if AI wants to end or transfer
                        if ac.call_state.get("call_ended"):
                            session["call_ended"] = True
                            session["disposition"] = ac.call_state.get("vicidial_disposition", "NI")
                            if ac.call_state.get("call_transferred"):
                                session["call_transferred"] = True
                                session["transfer_destination"] = _cfg("default_queue", "200")
                            return {
                                "text": reply,
                                "call_ended": True,
                                "transferred": session["call_transferred"],
                                "disposition": session["disposition"],
                            }

                        return {
                            "text": reply,
                            "call_ended": False,
                            "transferred": False,
                        }
            except Exception as e:
                print(f"[VICIdial] AI processing error: {e}")

    return {
        "text": session.get("last_ai_text", ""),
        "call_ended": session.get("call_ended", False),
        "transferred": session.get("call_transferred", False),
    }


def _process_lead_audio(call_id: str, audio_data: bytes) -> dict:
    """
    Process recorded audio from the lead.
    Transcribes it and feeds to the AI agent.
    """
    import agent_campaign as ac

    # Save audio to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    try:
        tmp.write(audio_data)
        tmp.close()

        # Transcribe using Whisper
        text = ac.transcribe(tmp_path)
        if not text:
            return {"text": "", "error": "Transcription failed"}

        # Queue the text for AI processing
        with _vicidial_lock:
            session = _vicidial_sessions.get(call_id)
            if session:
                session["pending_input"] = text

        return {"text": text, "error": None}

    except Exception as e:
        return {"text": "", "error": str(e)}
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


# ============================================================
#  CONFIGURATION ENDPOINTS
# ============================================================

@router.get("/config")
def get_vicidial_config_endpoint(user: dict = Depends(require_user)):
    """Get current VICIdial integration configuration from database."""
    db_config = get_vicidial_config() or {}

    # Mask sensitive values
    masked = dict(db_config)
    for key in ("api_pass", "agent_pass"):
        if masked.get(key):
            masked[key] = "********"

    # Add parsed boolean fields
    masked["connected"] = db_config.get("connected", "false").lower() == "true"
    masked["last_check"] = int(db_config.get("last_check", "0"))

    # Add frontend aliases
    if "server_ip" in db_config and "server_url" not in masked:
        masked["server_url"] = db_config["server_ip"]

    return masked


@router.post("/config")
def update_vicidial_config_endpoint(body: VICIdialConfigUpdate, user: dict = Depends(require_user)):
    """Update VICIdial integration configuration in database (takes effect instantly)."""
    updates = body.model_dump(exclude_none=True)

    # Save each field to database
    db_key_map = {
        "api_url": "api_url",
        "api_user": "api_user",
        "api_pass": "api_pass",
        "agent_user": "agent_user",
        "agent_pass": "agent_pass",
        "campaign_id": "campaign_id",
        "default_queue": "default_queue",
        "server_ip": "server_ip",
        "server_url": "server_ip",  # alias
        "transfer_mode": "transfer_mode",
        "mode": "mode",
    }

    for body_key, value in updates.items():
        db_key = db_key_map.get(body_key)
        if db_key:
            set_vicidial_config(db_key, str(value))
            # Also sync to environment for any in-process code
            env_map = {
                "api_url": "VICIDIAL_API_URL",
                "api_user": "VICIDIAL_API_USER",
                "api_pass": "VICIDIAL_API_PASS",
                "agent_user": "VICIDIAL_AGENT_USER",
                "agent_pass": "VICIDIAL_AGENT_PASS",
                "campaign_id": "VICIDIAL_CAMPAIGN_ID",
                "default_queue": "VICIDIAL_DEFAULT_QUEUE",
                "server_ip": "VICIDIAL_SERVER_IP",
                "server_url": "VICIDIAL_SERVER_IP",  # alias
                "transfer_mode": "VICIDIAL_TRANSFER_MODE",
            }
            env_key = env_map.get(body_key)
            if env_key:
                os.environ[env_key] = str(value)

    # Test connection if URL was updated
    if body.api_url:
        try:
            from backend.vicidial_client import check_connection
            result = check_connection()
            set_vicidial_config("connected", str(result.get("connected", False)))
            set_vicidial_config("last_check", str(int(time.time())))
        except Exception as e:
            set_vicidial_config("connected", "false")
            set_vicidial_config("last_check", str(int(time.time())))

    log_activity(
        user_id=user["user_id"],
        user_name=user["user_name"],
        action="vicidial_config_updated",
        details=f"VICIdial configuration updated",
        ip_address="",
    )

    # Return updated config
    updated = get_vicidial_config() or {}
    updated["connected"] = updated.get("connected", "false").lower() == "true"
    updated["last_check"] = int(updated.get("last_check", "0"))
    # Mask passwords
    for key in ("api_pass", "agent_pass"):
        if updated.get(key):
            updated[key] = "********"

    return {"message": "Configuration updated", "config": updated}


@router.post("/config/test")
def test_vicidial_connection(user: dict = Depends(require_user)):
    """Test the VICIdial API connection and verify credentials."""
    try:
        from backend.vicidial_client import verify_api_credentials
        result = verify_api_credentials()

        connected = result.get("api_ok", False)
        set_vicidial_config("connected", str(connected))
        set_vicidial_config("last_check", str(int(time.time())))

        return result
    except Exception as e:
        set_vicidial_config("connected", "false")
        set_vicidial_config("last_check", str(int(time.time())))
        return {
            "api_ok": False,
            "agent_ok": False,
            "campaign_ok": False,
            "error": str(e),
        }


# ============================================================
#  AGI CALLBACK ENDPOINTS
# ============================================================

@router.post("/agi-start-call")
def agi_start_call(body: AGICallStartRequest):
    """
    Called by the AGI script when VICIdial answers a call.
    Starts an AI session for this call.
    """
    _verify_callback_secret(body.secret)

    if not body.call_id:
        raise HTTPException(status_code=400, detail="call_id is required")

    result = _init_ai_session(
        call_id=body.call_id,
        phone_number=body.phone_number,
        customer_name=body.customer_name,
        lead_id=body.lead_id,
        campaign_id=body.campaign_id,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "session_id": body.call_id,
        "agent_name": result.get("agent_name", "AI Agent"),
        "pitch": result.get("pitch", ""),
        "message": "AI session started",
    }


@router.get("/agi-next-response/{call_id}")
def agi_next_response(call_id: str):
    """
    Called repeatedly by the AGI script to get the next AI response text.
    Returns text for TTS conversion and playback.
    """
    result = _get_next_ai_text(call_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.post("/agi-process-audio/{call_id}")
async def agi_process_audio(call_id: str, audio: UploadFile = File(...)):
    """
    Called by the AGI script with recorded lead audio.
    Transcribes and processes it through the AI agent.
    """
    content = await audio.read()

    if not content:
        raise HTTPException(status_code=400, detail="No audio data")

    result = _process_lead_audio(call_id, content)

    return {
        "transcribed": result.get("text", ""),
        "error": result.get("error"),
    }


@router.get("/agi-call-result/{call_id}")
def agi_call_result(call_id: str):
    """
    Called by the AGI script at the end of the call to get the final decision.
    Returns whether to transfer or hangup, and the disposition.
    Uses the disposition set by the AI agent during the call.
    """
    with _vicidial_lock:
        session = _vicidial_sessions.get(call_id)

    if not session:
        return {"transfer": False, "disposition": "ERR"}

    disposition = session.get("disposition") or "NI"

    if session.get("call_transferred"):
        return {
            "transfer": True,
            "destination": session.get("transfer_destination", "200"),
            "disposition": disposition,
            "age_collected": session.get("age_collected"),
            "customer_name": session.get("customer_name"),
        }
    else:
        return {
            "transfer": False,
            "disposition": disposition,
            "age_collected": session.get("age_collected"),
            "customer_name": session.get("customer_name"),
        }


@router.get("/pitch-audio/{call_id}")
def agi_pitch_audio(call_id: str):
    """
    Generate and return the AI agent's opening pitch as audio.
    The AGI script plays this when the call starts.
    """
    import agent_campaign as ac

    with _vicidial_lock:
        session = _vicidial_sessions.get(call_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    pitch = session.get("pitch", "")
    if not pitch:
        raise HTTPException(status_code=404, detail="No pitch found")

    # Generate TTS audio
    try:
        resp = requests.post(
            _get_tts_url(),
            json={"text": pitch, "voice": os.getenv("EDGE_VOICE", "en-US-GuyNeural")},
            timeout=30,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="TTS generation failed")

        from fastapi.responses import Response
        return Response(content=resp.content, media_type="audio/wav")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")


@router.post("/tts")
def vicidial_tts(body: dict):
    """
    Convert text to speech for AGI playback.
    Used by the AGI script to generate audio for AI responses.
    """
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        resp = requests.post(
            _get_tts_url(),
            json={
                "text": text,
                "voice": os.getenv("EDGE_VOICE", "en-US-GuyNeural"),
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="TTS generation failed")

        from fastapi.responses import Response
        return Response(content=resp.content, media_type="audio/wav")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")


# ============================================================
#  LEAD SYNC ENDPOINTS
# ============================================================

@router.post("/sync-leads-to-vicidial")
def sync_leads_to_vicidial(body: LeadSyncRequest, user: dict = Depends(require_user)):
    """
    Sync Empire-X leads to VICIdial.
    Takes leads from Empire-X and creates them in VICIdial's campaign.
    """
    try:
        from backend.vicidial_client import sync_leads_from_empire

        result = sync_leads_from_empire(
            campaign_id=body.campaign_id or _cfg("campaign_id", ""),
            leads=[{
                "phone_number": l.get("phone_number", ""),
                "first_name": l.get("first_name", ""),
                "last_name": l.get("last_name", ""),
            } for l in body.leads],
        )

        log_activity(
            user_id=user["user_id"],
            user_name=user["user_name"],
            action="vicidial_leads_synced",
            details=f"Synced {result.get('imported', 0)} leads to VICIdial",
            ip_address="",
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")


@router.get("/leads")
def list_vicidial_leads(
    campaign_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(require_user),
):
    """List leads from VICIdial."""
    try:
        from backend.vicidial_client import list_leads

        result = list_leads(
            campaign_id=campaign_id,
            status=status,
            limit=limit,
        )
        return {"leads": result, "count": len(result) if isinstance(result, list) else 0}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list VICIdial leads: {e}")


# ============================================================
#  AGENT STATUS & CONTROL
# ============================================================

@router.post("/agent/login")
def login_ai_agent(user: dict = Depends(require_user)):
    """Log the AI agent into VICIdial."""
    try:
        from backend.vicidial_client import agent_login

        result = agent_login()
        return {"message": "AI agent logged in", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {e}")


@router.post("/agent/logout")
def logout_ai_agent(user: dict = Depends(require_user)):
    """Log the AI agent out of VICIdial."""
    try:
        from backend.vicidial_client import agent_logout
        result = agent_logout()
        return {"message": "AI agent logged out", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {e}")


@router.get("/agent/status")
def get_ai_agent_status(user: dict = Depends(require_user)):
    """Get the AI agent's current status in VICIdial."""
    try:
        from backend.vicidial_client import get_agent_status
        result = get_agent_status()
        return {"status": result}
    except Exception as e:
        return {"status": "UNKNOWN", "error": str(e)}


# ============================================================
#  CAMPAIGN CONTROL
# ============================================================

@router.post("/campaign/start")
def start_vicidial_campaign(user: dict = Depends(require_user)):
    """Start the VICIdial auto-dialer campaign."""
    try:
        from backend.vicidial_client import start_campaign
        result = start_campaign()
        return {"message": "Campaign started", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start campaign: {e}")


@router.post("/campaign/stop")
def stop_vicidial_campaign(user: dict = Depends(require_user)):
    """Stop the VICIdial auto-dialer campaign."""
    try:
        from backend.vicidial_client import stop_campaign
        result = stop_campaign()
        return {"message": "Campaign stopped", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop campaign: {e}")


@router.get("/campaign/status")
def get_vicidial_campaign_status(user: dict = Depends(require_user)):
    """Get VICIdial campaign status (active calls, agents, etc.)."""
    try:
        from backend.vicidial_client import get_campaign_status
        result = get_campaign_status()
        return result
    except Exception as e:
        return {"error": str(e), "status": "UNKNOWN"}


# ============================================================
#  TRANSFER MANAGEMENT
# ============================================================

@router.post("/transfer/{call_id}")
def transfer_call_to_human(
    call_id: str,
    destination: Optional[str] = None,
    user: dict = Depends(require_user),
):
    """
    Transfer a VICIdial call from the AI agent to a human agent.
    This can be called manually (via UI) or triggered automatically by the AI.
    """
    try:
        from backend.vicidial_client import transfer_call

        dest = destination or _cfg("default_queue", "200")
        result = transfer_call(
            call_id=call_id,
            destination=dest,
            transfer_type="AGENT",
        )

        # Update session
        with _vicidial_lock:
            if call_id in _vicidial_sessions:
                _vicidial_sessions[call_id]["call_transferred"] = True
                _vicidial_sessions[call_id]["transfer_destination"] = dest

        log_activity(
            user_id=user["user_id"],
            user_name=user["user_name"],
            action="vicidial_transfer",
            details=f"Transferred call {call_id} to {dest}",
            ip_address="",
        )

        return {"message": f"Call {call_id} transferred to {dest}", "result": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transfer failed: {e}")


# ============================================================
#  SESSION MANAGEMENT
# ============================================================

@router.get("/sessions")
def list_vicidial_sessions(user: dict = Depends(require_user)):
    """List all active VICIdial sessions being handled by the AI agent."""
    with _vicidial_lock:
        active = {
            k: {
                "call_id": v.get("call_id"),
                "phone_number": v.get("phone_number"),
                "customer_name": v.get("customer_name"),
                "started_at": v.get("started_at"),
                "call_ended": v.get("call_ended"),
                "call_transferred": v.get("call_transferred"),
                "age_collected": v.get("age_collected"),
                "current_turn": v.get("current_turn"),
            }
            for k, v in _vicidial_sessions.items()
            if not v.get("call_ended") or (time.time() - v.get("started_at", 0)) < 3600
        }
    return {"active_sessions": len(active), "sessions": list(active.values())}


@router.get("/sessions/{call_id}")
def get_vicidial_session(call_id: str, user: dict = Depends(require_user)):
    """Get details of a specific VICIdial call session."""
    with _vicidial_lock:
        session = _vicidial_sessions.get(call_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ============================================================
#  STATUS & HEALTH
# ============================================================

@router.get("/status")
def vicidial_integration_status(user: dict = Depends(require_user)):
    """
    Get the overall status of the VICIdial integration (dynamic from DB).
    Shows connection status, active sessions, agent status, etc.
    """
    db_config = get_vicidial_config() or {}

    result = {
        "connected": db_config.get("connected", "false").lower() == "true",
        "api_url": db_config.get("api_url", ""),
        "campaign_id": db_config.get("campaign_id", ""),
        "agent_user": db_config.get("agent_user", ""),
        "mode": db_config.get("mode", "local"),
        "last_check": int(db_config.get("last_check", "0")),
        "active_sessions": 0,
    }

    with _vicidial_lock:
        result["active_sessions"] = sum(
            1 for s in _vicidial_sessions.values()
            if not s.get("call_ended")
        )

    # Try to get live agent status
    try:
        _setup_vicidial_client_env()
        from backend.vicidial_client import get_agent_status
        agent_status = get_agent_status()
        result["agent_status"] = agent_status
    except Exception as e:
        result["agent_status"] = f"Error: {e}"

    return result


@router.get("/dialplan-config")
def get_dialplan_config(user: dict = Depends(require_user)):
    """
    Generate the Asterisk dialplan configuration needed for VICIdial.
    This is the config that needs to be added to VICIdial's extensions.conf.
    """
    from backend.agi_handler import generate_vicidial_extensions_config

    server_ip = get_vicidial_config("server_ip") or "YOUR_EMPIRE_SERVER_IP"
    config = generate_vicidial_extensions_config(server_ip)

    return {
        "config": config,
        "instructions": (
            "1. Copy the above config into /etc/asterisk/extensions_custom.conf\n"
            "2. Run: asterisk -rx 'dialplan reload'\n"
            "3. In VICIdial Admin: Servers → Edit your server\n"
            "4. Set 'AGI Server' to your Empire-X server IP\n"
            "5. Set 'AGI Port' to 4573\n"
            "6. Save and restart VICIdial services"
        ),
    }
