"""
VICIdial API Client
===================
Integrates Empire-X AI Calling Platform with VICIdial.

How VICIdial Works (high-level):
  - VICIdial is an open-source contact center suite built on Asterisk
  - It manages campaigns, dials leads (auto-dialer), and routes calls to agents
  - When a call is answered, VICIdial can:
    1. Run an AGI script (vicidial_agi.php in our integration)
    2. Send the call to an available human agent in a queue
    3. Forward audio to an external system (like our AI agent)

Integration Flow:
  1. Empire-X imports leads INTO VICIdial via its API (or VICIdial already has them)
  2. VICIdial auto-dials a lead (phone_number)
  3. When answered, VICIdial runs our AGI script (vicidial_agi.py)
  4. The AGI script calls back to Empire-X HTTP API with the call SID
  5. Empire-X AI agent (agent_campaign.py) processes the call via the AGI bridge
  6. If the lead qualifies (age 50-80), the AI tells the AGI to transfer the call
  7. The AGI script transfers the call to the designated VICIdial queue/extension
  8. A human agent in VICIdial picks up the transferred call

VICIdial API (api.php) endpoints we use:
  - version              : Check connection
  - agent_login          : Log in Empire-X as a virtual "agent" in VICIdial
  - agent_logout         : Log out
  - add_lead             : Add a lead to a VICIdial campaign
  - update_lead          : Update lead status/disposition
  - agent_pause          : Pause the AI agent
  - agent_unpause        : Unpause the AI agent
  - call_dispo           : Set call disposition (result)
  - transfer_conf        : Transfer to a conference (for human takeover)
  - agent_transfer       : Transfer call to another agent
  - get_agent_status     : Get current agent status
  - vicidial_list_leads  : List leads in a campaign
"""

import os
import time
import json
import hashlib
import logging
from typing import Optional, Any
from urllib.parse import urlencode, quote_plus
import requests

logger = logging.getLogger("vicidial")

# ============================================================
#  CONFIG
# ============================================================
VICIDIAL_API_URL      = os.getenv("VICIDIAL_API_URL", "http://YOUR_VICIDIAL_SERVER/vicidial/non_agent_api.php")
VICIDIAL_API_USER     = os.getenv("VICIDIAL_API_USER", "6666")           # non-agent API user
VICIDIAL_API_PASS     = os.getenv("VICIDIAL_API_PASS", "api_pass")
VICIDIAL_AGENT_USER   = os.getenv("VICIDIAL_AGENT_USER", "AI_AGENT_01") # VICIdial agent number
VICIDIAL_AGENT_PASS   = os.getenv("VICIDIAL_AGENT_PASS", "agent_pass")
VICIDIAL_CAMPAIGN_ID  = os.getenv("VICIDIAL_CAMPAIGN_ID", "AI_CAMPAIGN")
VICIDIAL_DEFAULT_QUEUE = os.getenv("VICIDIAL_DEFAULT_QUEUE", "200")     # queue to transfer to
VICIDIAL_INGROUP      = os.getenv("VICIDIAL_INGROUP", "---")            # Ingroup for inbound calls
VICIDIAL_SERVER_IP    = os.getenv("VICIDIAL_SERVER_IP", "10.0.0.1")     # VICIdial server IP

# Empire-X callback endpoint that VICIdial AGI will call
EMPIRE_CALLBACK_URL   = os.getenv("EMPIRE_CALLBACK_URL", "http://localhost:8002/api/vicidial/callback")
EMPIRE_CALLBACK_KEY   = os.getenv("EMPIRE_CALLBACK_KEY", "empire_secret_callback_key")


class VICIdialError(Exception):
    """Raised when VICIdial API returns an error."""
    pass


def _api_request(params: dict) -> dict:
    """
    Send a request to VICIdial's non_agent_api.php.
    VICIdial API documentation: https://vicidial.org/docs/
    """
    payload = {
        "source": "Empire-X",
        "user": VICIDIAL_API_USER,
        "pass": VICIDIAL_API_PASS,
        "format": "json",
        **params,
    }

    try:
        logger.info(f"VICIdial API request: {params.get('function') or params.get('action', 'unknown')}")
        resp = requests.get(VICIDIAL_API_URL, params=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        logger.debug(f"VICIdial response: {data}")
        return data
    except requests.exceptions.RequestException as e:
        logger.error(f"VICIdial API request failed: {e}")
        raise VICIdialError(f"VICIdial connection failed: {e}")
    except json.JSONDecodeError as e:
        logger.error(f"VICIdial invalid JSON: {resp.text[:500]}")
        raise VICIdialError(f"VICIdial invalid response: {e}")


def _api_post(endpoint: str, params: dict, files: dict = None) -> dict:
    """Send a POST request to VICIdial API with optional file uploads."""
    payload = {
        "source": "Empire-X",
        "user": VICIDIAL_API_USER,
        "pass": VICIDIAL_API_PASS,
        **params,
    }

    try:
        url = VICIDIAL_API_URL.replace("non_agent_api.php", endpoint)
        logger.info(f"VICIdial POST to {endpoint}: {params.get('function') or params.get('action', 'unknown')}")
        resp = requests.post(url, data=payload, files=files, timeout=30)
        resp.raise_for_status()
        try:
            return resp.json()
        except json.JSONDecodeError:
            return {"raw": resp.text}
    except requests.exceptions.RequestException as e:
        logger.error(f"VICIdial POST failed: {e}")
        raise VICIdialError(f"VICIdial POST failed: {e}")


# ============================================================
#  LEAD MANAGEMENT
# ============================================================

def add_lead(
    phone_number: str,
    first_name: str = "",
    last_name: str = "",
    campaign_id: str = None,
    list_id: str = "1",
    source: str = "Empire-X",
    vendor_id: str = None,
    **extra_fields,
) -> dict:
    """
    Add a lead to a VICIdial campaign.
    VICIdial will auto-dial this lead when the campaign is running.

    Args:
        phone_number: The lead's phone number (E.164 recommended)
        first_name: Lead's first name
        last_name: Lead's last name
        campaign_id: VICIdial campaign ID (defaults to env var)
        list_id: VICIdial list ID (defaults to "1")
        source: Source identifier
        vendor_id: Optional vendor lead code

    Returns:
        VICIdial API response with lead_id
    """
    params = {
        "function": "add_lead",
        "phone_number": phone_number,
        "first_name": first_name,
        "last_name": last_name,
        "list_id": list_id,
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
        "source": source,
    }
    if vendor_id:
        params["vendor_id"] = vendor_id

    # Add any additional custom fields
    for k, v in extra_fields.items():
        params[k] = str(v)

    return _api_request(params)


def update_lead(lead_id: str, **fields) -> dict:
    """
    Update a lead in VICIdial (status, result, custom data, etc.).

    Args:
        lead_id: The VICIdial lead ID to update
        **fields: Fields to update (status, call_result, age_collected, etc.)

    Returns:
        VICIdial API response
    """
    params = {
        "function": "update_lead",
        "lead_id": lead_id,
    }
    for k, v in fields.items():
        params[k] = str(v) if v is not None else ""
    return _api_request(params)


def list_leads(
    campaign_id: str = None,
    list_id: str = None,
    status: str = None,
    limit: int = 100,
) -> list:
    """
    List leads from VICIdial.

    Args:
        campaign_id: Filter by campaign
        list_id: Filter by list
        status: Filter by status (NEW, ACTIVE, etc.)
        limit: Max records to return

    Returns:
        List of lead dicts
    """
    params = {
        "function": "vicidial_list_leads",
        "limit": limit,
    }
    if campaign_id:
        params["campaign_id"] = campaign_id
    if list_id:
        params["list_id"] = list_id
    if status:
        params["status"] = status

    resp = _api_request(params)
    # VICIdial may return data in different formats
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict) and "data" in resp:
        return resp["data"]
    if isinstance(resp, dict) and "leads" in resp:
        return resp["leads"]
    return [resp] if isinstance(resp, dict) else []


# ============================================================
#  AGENT MANAGEMENT
# ============================================================

def agent_login(
    agent_user: str = None,
    agent_pass: str = None,
    campaign_id: str = None,
) -> dict:
    """
    Log in Empire-X as a virtual agent in VICIdial.
    This is required for the AI agent to receive calls from VICIdial.

    Args:
        agent_user: VICIdial agent username
        agent_pass: VICIdial agent password
        campaign_id: Campaign to log into

    Returns:
        API response with session info
    """
    params = {
        "function": "agent_login",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
        "agent_pass": agent_pass or VICIDIAL_AGENT_PASS,
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
    }
    return _api_request(params)


def agent_logout(agent_user: str = None) -> dict:
    """
    Log out the AI virtual agent from VICIdial.
    """
    params = {
        "function": "agent_logout",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    return _api_request(params)


def agent_pause(agent_user: str = None, pause_code: str = "AI") -> dict:
    """
    Pause the AI agent in VICIdial (stop receiving calls).
    """
    params = {
        "function": "agent_pause",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
        "pause_code": pause_code,
    }
    return _api_request(params)


def agent_unpause(agent_user: str = None) -> dict:
    """
    Unpause the AI agent (resume receiving calls).
    """
    params = {
        "function": "agent_unpause",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    return _api_request(params)


def get_agent_status(agent_user: str = None) -> dict:
    """
    Get current status of the AI virtual agent in VICIdial.

    Returns status info like: READY, PAUSED, INCALL, etc.
    """
    params = {
        "function": "get_agent_status",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    return _api_request(params)


# ============================================================
#  CALL OPERATIONS
# ============================================================

def call_disposition(
    call_id: str,
    disposition: str,
    lead_id: str = None,
    agent_user: str = None,
    comments: str = "",
    **extra,
) -> dict:
    """
    Set the call disposition (result) in VICIdial.

    Common dispositions in VICIdial:
      - SALE         : Converted / successful
      - TRANSFER     : Transferred to human agent
      - CALLBK       : Callback requested
      - NOTINTEREST  : Not interested
      - DNC          : Do not call
      - INVALID      : Wrong number / invalid
      - ANSWERED     : General answered disposition

    Args:
        call_id: The VICIdial call ID (uniqueid)
        disposition: Disposition code
        lead_id: Associated lead ID
        agent_user: Agent who handled the call
        comments: Additional notes

    Returns:
        API response
    """
    params = {
        "function": "call_dispo",
        "call_id": call_id,
        "disposition": disposition,
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
        "comments": comments,
    }
    if lead_id:
        params["lead_id"] = lead_id
    for k, v in extra.items():
        params[k] = str(v) if v is not None else ""
    return _api_request(params)


def transfer_call(
    call_id: str,
    destination: str = None,
    transfer_type: str = "AGENT",   # AGENT, QUEUE, EXTEN, CONFERENCE
    agent_user: str = None,
) -> dict:
    """
    Transfer an active call to a human agent or queue in VICIdial.

    This is the KEY function for the AI → Human transfer flow.

    How transfer works in VICIdial:
      - AGENT:     Transfer to a specific agent extension (e.g., "200")
      - QUEUE:     Transfer to a queue/ingroup (e.g., "Sales")
      - EXTEN:     Transfer to an extension number
      - CONFERENCE: Park in a conference room, agents can pick up

    Args:
        call_id: The VICIdial call uniqueid
        destination: Target extension/queue (defaults to VICIDIAL_DEFAULT_QUEUE)
        transfer_type: AGENT, QUEUE, EXTEN, or CONFERENCE
        agent_user: The AI agent user performing the transfer

    Returns:
        API response
    """
    params = {
        "function": "agent_transfer",
        "call_id": call_id,
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
        "transfer_type": transfer_type,
        "destination": destination or VICIDIAL_DEFAULT_QUEUE,
    }
    return _api_request(params)


def transfer_to_conference(call_id: str, conf_id: str = None, agent_user: str = None) -> dict:
    """
    Transfer the call to a conference bridge where a human agent can join.
    Useful if you want a human to be able to pick up the call.

    Args:
        call_id: VICIdial call uniqueid
        conf_id: Conference ID (e.g., "8600051")
        agent_user: AI agent user

    Returns:
        API response
    """
    params = {
        "function": "transfer_conf",
        "call_id": call_id,
        "conf_id": conf_id or "8600051",
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    return _api_request(params)


def hangup_call(call_id: str, agent_user: str = None) -> dict:
    """
    Hang up an active call in VICIdial.
    """
    params = {
        "function": "hangup_call",
        "call_id": call_id,
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    return _api_request(params)


# ============================================================
#  CAMPAIGN / DIALER CONTROL
# ============================================================

def dial_lead(
    phone_number: str,
    campaign_id: str = None,
    lead_id: str = None,
    agent_user: str = None,
) -> dict:
    """
    Manually dial a specific lead (for preview/manual mode).
    The AI agent will receive the call once answered.

    Args:
        phone_number: The number to dial
        campaign_id: VICIdial campaign ID
        lead_id: Lead ID (if known)
        agent_user: Agent to receive the call

    Returns:
        API response with call_id
    """
    params = {
        "function": "dial_lead",
        "phone_number": phone_number,
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
        "agent_user": agent_user or VICIDIAL_AGENT_USER,
    }
    if lead_id:
        params["lead_id"] = lead_id
    return _api_request(params)


def start_campaign(campaign_id: str = None) -> dict:
    """
    Start/resume auto-dialing for a VICIdial campaign.
    """
    params = {
        "function": "start_campaign",
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
    }
    return _api_request(params)


def stop_campaign(campaign_id: str = None) -> dict:
    """
    Stop/pause auto-dialing for a VICIdial campaign.
    """
    params = {
        "function": "stop_campaign",
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
    }
    return _api_request(params)


def get_campaign_status(campaign_id: str = None) -> dict:
    """
    Get current status of a VICIdial campaign.
    Returns: active calls, waiting calls, agents, etc.
    """
    params = {
        "function": "get_campaign_status",
        "campaign_id": campaign_id or VICIDIAL_CAMPAIGN_ID,
    }
    return _api_request(params)


# ============================================================
#  AGI SCRIPT HELPER (for the AGI callback)
# ============================================================

def parse_agi_callback_request(data: dict) -> dict:
    """
    Parse the callback request sent by the VICIdial AGI script.
    The AGI script calls Empire-X when a call is answered,
    sending the call SID, lead info, and audio channel details.

    Example callback data from AGI:
    {
        "action": "call_answered",
        "call_id": "1234567890.123",
        "phone_number": "+15551234567",
        "lead_id": "5001",
        "customer_name": "John Smith",
        "campaign_id": "AI_CAMPAIGN",
        "agi_channel": "SIP/trunk-001",
        "agi_uniqueid": "1234567890.123",
    }

    This data is used to establish the audio bridge between
    VICIdial and the Empire-X AI agent.
    """
    required = ["call_id", "phone_number"]
    for field in required:
        if field not in data:
            raise VICIdialError(f"Missing required field in AGI callback: {field}")
    return data


def format_agi_transfer_command(
    call_id: str,
    destination: str,
    transfer_type: str = "AGENT",
) -> str:
    """
    Format the AGI command that the AGI script will use
    to transfer the call to a human agent.

    The AGI script receives this command via Empire-X's response
    and executes it in the Asterisk dialplan.

    Returns:
        AGI command string (e.g., "EXEC Transfer SIP/200")
    """
    if transfer_type == "AGENT":
        return f"EXEC Transfer SIP/{destination}"
    elif transfer_type == "QUEUE":
        return f"EXEC Queue {destination}"
    elif transfer_type == "EXTEN":
        return f"EXEC Dial SIP/{destination}"
    elif transfer_type == "CONFERENCE":
        return f"EXEC MeetMe {destination}"
    elif transfer_type == "HANGUP":
        return "EXEC Hangup"
    return f"EXEC Transfer {destination}"


def check_connection() -> dict:
    """
    Check if VICIdial API is reachable.
    """
    try:
        resp = _api_request({"function": "version"})
        return {"connected": True, "version": str(resp)}
    except VICIdialError as e:
        return {"connected": False, "error": str(e)}


# ============================================================
#  BATCH LEAD SYNC
# ============================================================

def sync_leads_from_empire(campaign_id: str, leads: list) -> dict:
    """
    Bulk sync leads from Empire-X to VICIdial.

    Args:
        campaign_id: VICIdial campaign to add leads to
        leads: List of dicts with phone_number, first_name, last_name

    Returns:
        {imported: int, failed: int, errors: list}
    """
    imported = 0
    failed = 0
    errors = []

    for lead in leads:
        try:
            result = add_lead(
                phone_number=lead["phone_number"],
                first_name=lead.get("first_name", ""),
                last_name=lead.get("last_name", ""),
                campaign_id=campaign_id,
                source="Empire-X-Sync",
            )
            if result.get("status") == "SUCCESS" or "lead_id" in result:
                imported += 1
            else:
                failed += 1
                errors.append({"lead": lead, "error": str(result)})
        except Exception as e:
            failed += 1
            errors.append({"lead": lead, "error": str(e)})

        # Rate limit - small delay between lead imports
        time.sleep(0.05)

    return {"imported": imported, "failed": failed, "errors": errors[:20]}


# ============================================================
#  SESSION MANAGEMENT
# ============================================================

class VICIdialSession:
    """
    Manages the lifecycle of a single VICIdial call session
    handled by Empire-X AI agent.

    Tracks:
      - VICIdial call ID (uniqueid)
      - Lead info (name, phone, lead_id)
      - Empire-X chat session ID
      - AI agent decision (transfer or not)
      - Human agent who took over
    """

    def __init__(self, call_id: str, phone_number: str, customer_name: str = "there",
                 lead_id: str = None, campaign_id: str = None):
        self.call_id = call_id
        self.phone_number = phone_number
        self.customer_name = customer_name
        self.lead_id = lead_id
        self.campaign_id = campaign_id or VICIDIAL_CAMPAIGN_ID
        self.empire_session_id = None
        self.empire_call_id = None

        # AI agent state
        self.age_collected = None
        self.call_ended = False
        self.call_transferred = False

        # Transfer state
        self.transfer_requested = False
        self.transfer_completed = False
        self.transfer_destination = None
        self.human_agent_id = None
        self.human_agent_name = None

        # Timestamps
        self.answered_at = time.time()
        self.transferred_at = None
        self.completed_at = None

    def to_dict(self):
        return {
            "call_id": self.call_id,
            "phone_number": self.phone_number,
            "customer_name": self.customer_name,
            "lead_id": self.lead_id,
            "campaign_id": self.campaign_id,
            "empire_session_id": self.empire_session_id,
            "age_collected": self.age_collected,
            "call_ended": self.call_ended,
            "call_transferred": self.call_transferred,
            "transfer_requested": self.transfer_requested,
            "transfer_completed": self.transfer_completed,
            "human_agent_id": self.human_agent_id,
            "human_agent_name": self.human_agent_name,
            "answered_at": self.answered_at,
            "transferred_at": self.transferred_at,
            "duration": int(time.time() - self.answered_at) if not self.completed_at else None,
        }

    def mark_transferred(self, destination: str = None):
        """Mark the call as transferred to a human agent."""
        self.call_transferred = True
        self.transfer_requested = True
        self.transfer_destination = destination or VICIDIAL_DEFAULT_QUEUE
        self.transferred_at = time.time()

    def mark_completed(self):
        """Mark the call session as completed."""
        self.call_ended = True
        self.completed_at = time.time()

    def __repr__(self):
        return f"<VICIdialSession {self.call_id} {self.customer_name}>"


# ============================================================
#  VERIFICATION
# ============================================================

def verify_api_credentials() -> dict:
    """
    Verify that VICIdial API credentials are valid.
    Returns a detailed status report.
    """
    result = {"api_ok": False, "agent_ok": False, "campaign_ok": False, "details": {}}

    # 1. Check API connectivity
    try:
        api_resp = _api_request({"function": "version"})
        result["api_ok"] = True
        result["details"]["api_response"] = str(api_resp)[:200]
    except Exception as e:
        result["details"]["api_error"] = str(e)
        return result

    # 2. Check agent status
    try:
        agent_resp = get_agent_status()
        result["agent_ok"] = True
        result["details"]["agent_status"] = agent_resp
    except Exception as e:
        result["details"]["agent_error"] = str(e)

    # 3. Check campaign
    try:
        camp_resp = get_campaign_status()
        result["campaign_ok"] = True
        result["details"]["campaign"] = camp_resp
    except Exception as e:
        result["details"]["campaign_error"] = str(e)

    return result
