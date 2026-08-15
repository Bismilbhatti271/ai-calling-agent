"""
VICIdial AGI Handler
====================
Asterisk Gateway Interface (AGI) script that bridges VICIdial answered calls
to the Empire-X AI agent.

HOW AGI WORKS:
  - AGI is Asterisk's protocol for external call control
  - When a call is answered in VICIdial, Asterisk can run an external script
  - The script communicates via stdin/stdout with Asterisk
  - We use a Python AGI script that forwards the call to our AI agent

VICIdial DIALPLAN REQUIREMENTS:
  In your VICIdial extension map (extensions.conf), add:
  
  [empire-ai-agent]
  exten => s,1,Answer()
  exten => s,n,AGI(agi://EMPIRE_SERVER:4573/agi)
  exten => s,n,Hangup()

  Or use FastAGI by running:
    python backend/agi_server.py
  
  Then in VICIdial's admin interface:
    1. Admin → Servers → Modify your server
    2. Set "AGI Server" to your Empire-X server IP
    3. Set "AGI Port" to 4573
    4. Admin → Campaigns → Your Campaign
    5. Set "Auto Dial Level" to your desired dialing level
    6. Set "Agent Login" to the AI agent user (e.g., AI_AGENT_01)

AUDIO FLOW:
  The AGI script connects the VICIdial call audio to our AI agent:
  
  Lead ←→ VICIdial/Asterisk ←→ AGI ←→ Empire-X AI Agent
                                              ↓
                                         Groq LLM
                                              ↓
                                         Edge-TTS
                                              ↓
                                         Audio back through AGI

  For transfer, the AI agent tells the AGI script to:
    - Transfer the call to a VICIdial extension/queue
    - A human agent in VICIdial picks up
    - The AI agent disconnects

FASTAGI SERVER:
  Run: python backend/agi_handler.py
  This starts a FastAGI server on port 4573 that VICIdial/Asterisk connects to.
"""

import os
import sys
import json
import time
import logging
import threading
import subprocess
from typing import Optional
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("agi")

# Empire-X API URL (our own backend)
EMPIRE_API_BASE = os.getenv("EMPIRE_API_BASE", "http://localhost:8002/api")
CALLBACK_SECRET = os.getenv("EMPIRE_CALLBACK_KEY", "empire_secret_callback_key")
SERVER_IP = os.getenv("EMPIRE_SERVER_IP", "")  # Public IP for SIP REFER

# ============================================================
#  AGI PROTOCOL HELPERS
# ============================================================

class AGIChannel:
    """
    Wraps the AGI stdin/stdout channel for communicating with Asterisk.
    
    AGI Commands we use:
      GET VARIABLE <var>           - Get channel variable
      SET VARIABLE <var> <val>     - Set channel variable
      STREAM FILE <file> <escape>  - Play audio file to channel
      RECORD FILE <file> <fmt> <esc> <timeout> <silence> - Record audio
      EXEC <app> <args>            - Execute dialplan application
      SAY DIGITS <num> <esc>       - Say digits
      HANGUP                       - Hang up the call
      ANSWER                       - Answer the call
      TRANSFER <ext> <context> <pri>- Transfer call
    """

    def __init__(self, agi_env: dict = None):
        self.env = agi_env or {}
        self._buffer = []

    def command(self, cmd: str) -> str:
        """Send an AGI command and read the response."""
        sys.stdout.write(f"{cmd}\n")
        sys.stdout.flush()
        resp = sys.stdin.readline().strip()
        logger.debug(f"AGI cmd: {cmd} → {resp}")
        return resp

    def get_variable(self, var: str) -> Optional[str]:
        """Get a channel variable from Asterisk."""
        resp = self.command(f"GET VARIABLE {var}")
        if resp.startswith("200"):
            parts = resp.split("=", 1)
            if len(parts) > 1:
                val = parts[1].strip("() ")
                return val if val != "" else None
        return None

    def set_variable(self, var: str, val: str):
        """Set a channel variable."""
        self.command(f"SET VARIABLE {var} {val}")

    def stream_file(self, filename: str, escape_digits: str = "") -> str:
        """Play an audio file to the channel."""
        return self.command(f"STREAM FILE {filename} \"{escape_digits}\"")

    def record_file(self, filename: str, fmt: str = "wav",
                    escape_digits: str = "", timeout: int = 20000,
                    silence: int = 2000) -> str:
        """Record audio from the channel."""
        return self.command(
            f"RECORD FILE {filename} {fmt} \"{escape_digits}\" {timeout} {silence}"
        )

    def exec_app(self, app: str, args: str = "") -> str:
        """Execute a dialplan application."""
        return self.command(f"EXEC {app} {args}")

    def hangup(self):
        """Hangup the call."""
        self.command("HANGUP")

    def answer(self):
        """Answer the call (if not already answered)."""
        self.command("ANSWER")

    def transfer(self, extension: str, context: str = "default", priority: str = "1"):
        """Transfer the call to another extension/context."""
        return self.command(f"TRANSFER {extension} {context} {priority}")

    def say_number(self, num: int, escape_digits: str = ""):
        """Say a number using text-to-speech."""
        return self.command(f"SAY NUMBER {num} \"{escape_digits}\"")

    def wait(self, seconds: int = 1):
        """Wait for N seconds."""
        return self.command(f"WAIT {seconds}")

    def verbose(self, msg: str, level: int = 1):
        """Print a verbose message to the Asterisk CLI."""
        return self.command(f"VERBOSE \"{msg}\" {level}")


def parse_agi_environment() -> dict:
    """
    Parse the AGI environment variables sent by Asterisk on startup.
    Asterisk sends them as key-value pairs terminated by a blank line.
    
    Key variables:
      agi_request       : The AGI request URL
      agi_channel       : Channel name (e.g., SIP/trunk-001)
      agi_language      : Language (e.g., en)
      agi_type          : Channel type
      agi_uniqueid      : Unique call ID
      agi_callerid      : Caller ID number
      agi_dnid          : Dialed number
      agi_rdnis         : Redirected number
      agi_context       : Context
      agi_extension     : Extension
      agi_priority      : Priority
      agi_enhanced      : Enhanced AGI flag
      agi_accountcode   : Account code
      agi_network       : Network AGI flag
      agi_network_script: Network AGI script
    """
    env = {}
    line = sys.stdin.readline().strip()
    while line:
        if ":" in line:
            key, _, val = line.partition(":")
            env[key.strip()] = val.strip()
        line = sys.stdin.readline().strip()
    return env


# ============================================================
#  CORE AGI HANDLER
# ============================================================

def handle_agi_call(agi: AGIChannel, env: dict):
    """
    Main AGI call handler.
    This is called when a call is answered and routed to our AGI script.

    Flow:
      1. Extract call info from AGI environment
      2. Notify Empire-X backend about the new call
      3. Bridge audio with the AI agent via the AGI channel
      4. Wait for AI processing result (transfer or hangup)
      5. If transfer: execute transfer command to VICIdial queue
      6. If hangup: set disposition and end call
    """
    uniqueid = env.get("agi_uniqueid", str(int(time.time())))
    callerid = env.get("agi_callerid", "unknown")
    channel = env.get("agi_channel", "unknown")
    dnid = env.get("agi_dnid", "unknown")
    context = env.get("agi_context", "default")

    logger.info(f"AGI call received: ID={uniqueid} Caller={callerid} Channel={channel}")

    try:
        # 1. Answer the call
        agi.answer()
        agi.verbose(f"Empire-X AI handling call from {callerid}", 2)

        # 2. Look up lead info from VICIdial variables
        # VICIdial sets these channel variables:
        #   lead_id        : Lead database ID
        #   phone_code     : Phone code  
        #   phone_number   : Phone number
        #   full_name      : Customer full name
        #   campaign       : Campaign ID
        #   list_id        : List ID
        lead_id = agi.get_variable("lead_id") or ""
        phone_code = agi.get_variable("phone_code") or ""
        full_name = agi.get_variable("full_name") or callerid
        vicidial_campaign = agi.get_variable("campaign") or ""

        customer_name = full_name.split()[0] if full_name and full_name != callerid else "there"

        logger.info(f"Lead: {customer_name} ({callerid}) LeadID={lead_id} Campaign={vicidial_campaign}")

        # 3. Call back to Empire-X backend to initiate AI session
        empire_session = _start_ai_session(
            call_id=uniqueid,
            phone_number=callerid,
            customer_name=customer_name,
            lead_id=lead_id,
            campaign_id=vicidial_campaign,
        )

        if not empire_session:
            logger.error("Failed to start Empire-X AI session")
            agi.verbose("Empire-X AI unavailable - please try again", 3)
            agi.hangup()
            return

        session_id = empire_session.get("session_id")
        logger.info(f"Empire-X AI session started: {session_id}")

        # 4. Play initial greeting (TTS audio from AI)
        # The AI agent generates TTS audio and sends it back via the API
        # For AGI, we play the audio file generated by our TTS
        audio_dir = os.path.join(os.path.dirname(__file__), "..", "audio_cache")
        os.makedirs(audio_dir, exist_ok=True)

        # Play the opening pitch audio
        pitch_file = os.path.join(audio_dir, f"pitch_{uniqueid}.wav")
        if _download_pitch_audio(session_id, pitch_file):
            agi.stream_file(pitch_file.replace(".wav", ""))
        else:
            logger.warning("Could not download pitch audio, using TTS server directly")

        # 5. Main conversation loop - exchange audio with the lead
        _run_conversation_loop(agi, session_id, uniqueid, audio_dir)

        # 6. Check AI decision
        call_result = _get_call_result(session_id)
        logger.info(f"AI decision for {uniqueid}: {call_result}")

        if call_result.get("transfer"):
            # TRANSFER: Send call to human agent
            destination = call_result.get("destination", "200")
            logger.info(f"Transferring call {uniqueid} to {destination}")

            agi.verbose(f"Transferring to human agent at {destination}", 2)

            # Play transfer announcement
            transfer_file = os.path.join(audio_dir, f"transfer_{uniqueid}.wav")
            if _download_text_audio("Please hold while we connect you to a specialist.", transfer_file):
                agi.stream_file(transfer_file.replace(".wav", ""))

            # Check transfer mode from VICIdial config
            transfer_mode = "internal"
            try:
                from backend.database import get_vicidial_config
                mode_val = get_vicidial_config("transfer_mode", "internal")
                if mode_val:
                    transfer_mode = mode_val
            except:
                pass

            if transfer_mode == "sip_refer":
                # SIP REFER transfer: Send SIP REFER to caller
                # This makes the lead's phone re-invite directly to the human agent
                logger.info(f"Using SIP REFER transfer to {destination}")
                agi.verbose("Using SIP REFER transfer", 2)
                
                # Set SIP REFER headers
                sip_uri = f"sip:{destination}@{SERVER_IP}" if SERVER_IP else f"sip:{destination}"
                agi.set_variable("SIPADDHEADER", f"Refer-To: <{sip_uri}>")
                agi.set_variable("SIPREFER", "yes")
                
                # Execute blind transfer via SIP REFER
                # Asterisk will send a REFER to the caller's SIP channel
                agi.exec_app("Transfer", destination)
                
                logger.info(f"SIP REFER transfer sent to {destination}")
            else:
                # Internal Asterisk channel transfer (default)
                # Transfer the call to VICIdial's queue / agent extension
                logger.info(f"Using internal transfer to {destination}")
                agi.exec_app("Transfer", f"SIP/{destination}")
            # Also set the disposition in VICIdial (agent sets XFER, NI, DNQ, DNC, etc.)

            _set_vicidial_disposition(uniqueid, disposition, lead_id)
        else:
            # HANGUP: Call is done (not interested, wrong age, etc.)
            disposition = call_result.get("disposition", "NI")
            logger.info(f"Ending call {uniqueid} with disposition: {disposition}")

            agi.verbose(f"Call disposition: {disposition}", 2)

            # Set disposition in VICIdial
            _set_vicidial_disposition(uniqueid, disposition, lead_id)

            agi.hangup()

    except Exception as e:
        logger.error(f"AGI handler error: {e}", exc_info=True)
        try:
            agi.verbose(f"Error: {str(e)[:50]}", 3)
            agi.hangup()
        except:
            pass


def _start_ai_session(call_id: str, phone_number: str, customer_name: str,
                       lead_id: str, campaign_id: str) -> Optional[dict]:
    """Call Empire-X backend to start an AI session for this call."""
    import requests

    try:
        resp = requests.post(
            f"{EMPIRE_API_BASE}/vicidial/agi-start-call",
            json={
                "call_id": call_id,
                "phone_number": phone_number,
                "customer_name": customer_name,
                "lead_id": lead_id,
                "campaign_id": campaign_id,
                "secret": CALLBACK_SECRET,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            logger.error(f"Empire-X AI session start failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Empire-X connection failed: {e}")
        return None


def _download_pitch_audio(session_id: int, output_path: str) -> bool:
    """Download the AI agent's opening pitch as audio file."""
    import requests

    try:
        resp = requests.get(
            f"{EMPIRE_API_BASE}/vicidial/pitch-audio/{session_id}",
            timeout=15,
        )
        if resp.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(resp.content)
            return True
        return False
    except Exception as e:
        logger.warning(f"Pitch audio download failed: {e}")
        return False


def _download_text_audio(text: str, output_path: str) -> bool:
    """Convert text to audio using Empire-X TTS server and download."""
    import requests

    try:
        resp = requests.post(
            f"{EMPIRE_API_BASE}/vicidial/tts",
            json={"text": text},
            timeout=15,
        )
        if resp.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(resp.content)
            return True
        return False
    except Exception as e:
        logger.warning(f"TTS download failed: {e}")
        return False


def _run_conversation_loop(agi: AGIChannel, session_id: int, uniqueid: str, audio_dir: str):
    """
    Run the conversation loop between the lead and AI agent.
    For each exchange:
      1. AI generates response text
      2. TTS converts to audio
      3. AGI plays audio to lead
      4. AGI records lead's response
      5. Audio sent to STT (speech-to-text)
      6. Transcript sent to AI for next response
    """
    import requests

    max_turns = 30  # Safety limit
    turn = 0

    while turn < max_turns:
        # 1. Get next AI response text from Empire-X
        try:
            resp = requests.get(
                f"{EMPIRE_API_BASE}/vicidial/agi-next-response/{session_id}",
                timeout=30,
            )
            if resp.status_code != 200:
                logger.warning(f"Next response failed: {resp.status_code}")
                break

            result = resp.json()
            if result.get("call_ended"):
                logger.info("AI indicated call should end")
                break

            text = result.get("text", "")
            if not text:
                # Wait a bit and try again
                time.sleep(0.5)
                continue

            # 2. Convert AI text to audio via TTS
            audio_file = os.path.join(audio_dir, f"resp_{uniqueid}_{turn}.wav")
            if _download_text_audio(text, audio_file):
                # 3. Play audio to the lead
                agi.stream_file(audio_file.replace(".wav", ""))

            # 4. Record lead's response
            lead_file = os.path.join(audio_dir, f"lead_{uniqueid}_{turn}.wav")
            agi.record_file(
                lead_file.replace(".wav", ""),
                fmt="wav",
                timeout=8000,   # Max 8 seconds recording
                silence=1500,   # Stop after 1.5s silence
            )

            # 5. Send recorded audio to Empire-X for STT processing
            if os.path.exists(lead_file):
                with open(lead_file, "rb") as f:
                    resp = requests.post(
                        f"{EMPIRE_API_BASE}/vicidial/agi-process-audio/{session_id}",
                        files={"audio": f},
                        timeout=15,
                    )
                # Clean up lead audio file
                try:
                    os.remove(lead_file)
                except:
                    pass

            turn += 1

        except Exception as e:
            logger.error(f"Conversation loop error at turn {turn}: {e}")
            time.sleep(1)
            turn += 1


def _get_call_result(session_id: int) -> dict:
    """
    Get the AI agent's final decision for the call.
    Returns: {transfer: bool, destination: str, disposition: str, ...}
    """
    import requests

    try:
        resp = requests.get(
            f"{EMPIRE_API_BASE}/vicidial/agi-call-result/{session_id}",
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.error(f"Get call result failed: {e}")

    return {"transfer": False, "disposition": "ERR"}


def _set_vicidial_disposition(uniqueid: str, disposition: str, lead_id: str):
    """Set call disposition in VICIdial via API."""
    from .vicidial_client import call_disposition

    try:
        call_disposition(
            call_id=uniqueid,
            disposition=disposition,
            lead_id=lead_id,
            comments=f"Processed by Empire-X AI Agent",
        )
    except Exception as e:
        logger.warning(f"Failed to set VICIdial disposition: {e}")


# ============================================================
#  FASTAGI SERVER
# ============================================================

def run_fastagi_server(host: str = "0.0.0.0", port: int = 4573):
    """
    Run a simple FastAGI server that VICIdial/Asterisk connects to.

    Asterisk connects to this server when a call is answered in the AGI dialplan.
    Each connection is handled in a separate thread.

    To configure in VICIdial:
      1. Admin → Servers → Edit your server
      2. Set "AGI Server" to the Empire-X server IP
      3. Set "AGI Port" to 4573
      4. Save and restart VICIdial services

    Or in Asterisk dialplan directly:
      [empire-ai]
      exten => _X.,1,Answer()
      same => n,AGI(agi://YOUR_EMPIRE_SERVER:4573)
      same => n,Hangup()
    """
    import socket
    import socketserver

    class AGIRequestHandler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                # Read AGI environment from Asterisk
                env = {}
                data = self.request.recv(4096).decode("utf-8", errors="replace")
                lines = data.split("\n")
                for line in lines:
                    line = line.strip()
                    if not line:
                        break
                    if ":" in line:
                        key, _, val = line.partition(":")
                        env[key.strip()] = val.strip()

                # Create AGI channel using this socket
                agi = AGIChannel(env)
                agi._socket = self.request

                # Monkey-patch AGIChannel to use socket instead of stdin/stdout
                agi.command = lambda cmd: _socket_command(self.request, cmd)

                logger.info(f"FastAGI connection from {self.client_address}")
                handle_agi_call(agi, env)

            except Exception as e:
                logger.error(f"FastAGI handler error: {e}", exc_info=True)
            finally:
                try:
                    self.request.close()
                except:
                    pass

    def _socket_command(sock, cmd: str) -> str:
        """Send AGI command over socket and read response."""
        try:
            sock.sendall(f"{cmd}\n".encode())
            resp = b""
            while True:
                ch = sock.recv(1)
                if ch == b"\n":
                    break
                resp += ch
            result = resp.decode("utf-8", errors="replace").strip()
            logger.debug(f"AGI socket cmd: {cmd} → {result}")
            return result
        except Exception as e:
            logger.error(f"Socket command error: {e}")
            return ""

    class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        allow_reuse_address = True
        daemon_threads = True

    server = ThreadedServer((host, port), AGIRequestHandler)
    logger.info(f"FastAGI server listening on {host}:{port}")
    logger.info("Waiting for VICIdial/Asterisk to connect calls...")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("FastAGI server shutting down...")
        server.shutdown()


def run_stdin_agi():
    """
    Run AGI handler using stdin/stdout (standard AGI mode).
    This is the simpler mode - Asterisk runs this script directly.
    """
    logger.info("Starting AGI via stdin/stdout")
    env = parse_agi_environment()
    agi = AGIChannel(env)
    handle_agi_call(agi, env)


# ============================================================
#  HELPER: VICIdial Dialplan Config
# ============================================================

def generate_vicidial_extensions_config(empire_server_ip: str = None) -> str:
    """
    Generate the Asterisk extensions.conf entries needed for VICIdial
    to route answered calls to the Empire-X AI agent.

    Paste this into /etc/asterisk/extensions_custom.conf
    (or wherever your custom dialplan is in VICIdial).
    """
    server_ip = empire_server_ip or "YOUR_EMPIRE_SERVER_IP"

    return f"""
; ============================================================
;  Empire-X AI Agent Integration
;  Paste this into /etc/asterisk/extensions_custom.conf
;  Then run: asterisk -rx "dialplan reload"
; ============================================================

; If using AGI (script runs locally on VICIdial server):
[empire-ai-local]
exten => s,1,Answer()
same => n,AGI(/usr/share/asterisk/agi-bin/empire_agi.py)
same => n,Hangup()

; If using FastAGI (Empire-X runs on a separate server):
[empire-ai-remote]
exten => s,1,Answer()
same => n,AGI(agi://{server_ip}:4573)
same => n,Hangup()

; VICIdial main context - route calls to our AI agent
; Modify the appropriate VICIdial context based on your setup
[empire-ai-transfer]
exten => s,1,Answer()
same => n,Wait(1)
same => n,AGI(agi://{server_ip}:4573)
same => n,Hangup()

; Transfer destination context (where AI transfers to human agents)
[empire-human-agents]
exten => _X!,1,Dial(SIP/${{EXTEN}},30,tT)
same => n,Voicemail(${{EXTEN}},u)
same => n,Hangup()

; Conference bridge for AI → Human handoff
[empire-transfer-conf]
exten => 8600051,1,MeetMe(8600051,F)
same => n,Hangup()
"""


# ============================================================
#  MAIN ENTRY POINT
# ============================================================

if __name__ == "__main__":
    """
    Run as: python backend/agi_handler.py [--fastagi] [--port 4573]

    Modes:
      --fastagi : Run as FastAGI server (default)
      --stdin   : Run as stdin/stdout AGI (for direct Asterisk execution)
      --config  : Generate VICIdial dialplan config
    """
    import argparse

    parser = argparse.ArgumentParser(description="Empire-X VICIdial AGI Handler")
    parser.add_argument("--mode", choices=["fastagi", "stdin", "config"],
                       default="fastagi", help="AGI run mode")
    parser.add_argument("--host", default="0.0.0.0", help="FastAGI bind host")
    parser.add_argument("--port", type=int, default=4573, help="FastAGI bind port")
    parser.add_argument("--server-ip", help="Empire-X server IP (for config gen)")

    args = parser.parse_args()

    if args.mode == "fastagi":
        print(f"Starting Empire-X FastAGI server on {args.host}:{args.port}")
        print("VICIdial/Asterisk should be configured to connect here.")
        run_fastagi_server(host=args.host, port=args.port)

    elif args.mode == "stdin":
        print("Running in stdin/stdout AGI mode")
        print("Configure VICIdial to run this script on call answer.")
        run_stdin_agi()

    elif args.mode == "config":
        print(generate_vicidial_extensions_config(args.server_ip))
