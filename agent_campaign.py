import os
import re
import time
import random
import threading
import queue
import tempfile
import sounddevice as sd
import numpy as np
import soundfile as sf
import scipy.io.wavfile as wav
from dotenv import load_dotenv
from groq import Groq
import requests

# Pre-load TTS modules (so first call is fast, not delayed by imports)
_tts_ready = False
try:
    from gtts import gTTS
    import subprocess as _sp
    import imageio_ffmpeg as _ff
    _ffmpeg_path = _ff.get_ffmpeg_exe()
    import io as _io
    _tts_ready = True
except Exception:
    pass

# ============================================================
#  CONFIG
# ============================================================
load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SAMPLE_RATE           = 16000
EDGE_VOICE            = "en-US-GuyNeural"    # default, overridden per-call
_current_voice        = None                 # set by new_call_session()

# -- Audio normalization
NORMALIZE_AUDIO       = True

# -- Silence / recording
SILENCE_THRESHOLD     = 5
SILENCE_DURATION      = 1.0
MAX_RECORD_DURATION   = 20

# -- Audio quality gate
MIN_SPEECH_ENERGY     = 8
MIN_VOICED_CHUNKS     = 3

# -- Normalization
NORMALIZE_TARGET_RMS  = 4000
NORMALIZE_MAX_GAIN    = 20.0

# -- Barge-in (customer interrupts agent)
INTERRUPT_GRACE_SECS  = 0.5      # ignore barge-in for first 0.5s of each sentence
INTERRUPT_HITS_NEEDED = 2        # consecutive loud chunks needed = faster response
INTERRUPT_RATIO       = 2.5      # customer must be 2.5x louder than speaker bleed
INTERRUPT_FLOOR       = 60       # minimum volume to ever count as interruption
BLEED_MEASURE_CHUNKS  = 5        # chunks used to measure speaker bleed level
ONSET_ROLLING_CHUNKS  = 4        # how many pre-trigger chunks (~400ms) to keep so we
                                  # never lose the first word(s) the customer says

# -- Post-speech buffer
MIC_FLUSH_CHUNKS      = 6
POST_SPEECH_SETTLE_MS = 200

# -- Capture after barge-in (continuous stream now, no reopen/flush needed)
INTERRUPT_SILENCE_SECS = 0.9
INTERRUPT_MIN_SECS     = 0.2
INTERRUPT_MAX_SECS     = 10.0

# -- LLM
LLM_MODEL             = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
MAX_HISTORY_MESSAGES  = 16
MAX_REPLY_TOKENS      = 80
NO_SPEECH_TIMEOUT     = 20     # auto-end call after this many seconds of silence

INPUT_DEVICE          = None
OUTPUT_DEVICE         = None

# ============================================================
#  PER-CALL SESSION STATE
# ============================================================
# Everything below is reset at the start of every single call via
# new_call_session(). This prevents a customer's info / conversation
# history from a previous call leaking into the next one when this
# script is looped by the dialer (VICIdial).

AGENT_NAME     = None
CUSTOMER_NAME  = None
PITCH_A        = None
PITCH_B        = None
SYSTEM_PROMPT  = None
history        = []

call_state = {
    "not_interested_count": 0,
    "age_collected":        None,
    "call_ended":           False,
    "silence_duration":     0,
    "call_transferred":     False,
    # VICIdial-specific state
    "vicidial_mode":        False,       # True when called via VICIdial AGI
    "vicidial_call_id":     None,        # VICIdial call uniqueid
    "vicidial_lead_id":     None,        # VICIdial lead ID
    "vicidial_campaign_id": None,        # VICIdial campaign ID
    "vicidial_transfer_dest": None,      # Queue/extension to transfer to
    "vicidial_disposition": None,        # Final disposition for VICIdial
}


def reset_call_state():
    call_state["not_interested_count"] = 0
    call_state["age_collected"]        = None
    call_state["call_ended"]           = False
    call_state["silence_duration"]     = 0
    call_state["call_transferred"]     = False
    call_state["vicidial_mode"]        = False
    call_state["vicidial_call_id"]     = None
    call_state["vicidial_lead_id"]     = None
    call_state["vicidial_campaign_id"] = None
    call_state["vicidial_transfer_dest"] = None
    call_state["vicidial_disposition"] = None


def build_pitches(first_name, agent_name):
    """Single pitch — one consistent opening for every call."""
    pitch = (
        f"Hi {first_name}, this is {agent_name}. I'm calling because we're "
        "helping people see whether they qualify for final expense coverage "
        "that may include additional policy benefits, depending on "
        "eligibility. A licensed specialist can review the options "
        "available in your area and explain any applicable features. "
        "May I know how old you are?"
    )
    return pitch, pitch  # same pitch returned for both slots (no random alternation)


def build_system_prompt(agent_name):
    return f"""You are {agent_name}, a professional final expense insurance outbound call agent.
You are on a live phone call. Be warm, natural, and conversational — never robotic.

YOUR ONLY JOB:
1. The opening pitch has already been delivered (do NOT repeat it, do NOT re-introduce yourself).
2. Your one and only goal is to get the customer's age. Do not ask about
   decision-maker status, health, payment method, beneficiaries, or anything
   else that isn't in these instructions.
3. Once you have the age — stop and say the correct closing line exactly. Do not ask any other questions.

AGE RULES (strictly follow these, no exceptions):
- Age 50 to 80 → say EXACTLY:
  "Perfect — you sound like a great fit for this program. Now it's time to connect your
   call to my verification department — he will further assist you. Please stay on the line."
- Age BELOW 50 → say EXACTLY:
  "Thank you so much for your time — unfortunately you don't meet the eligibility criteria
   for this program at this time. I appreciate you speaking with me and hope you have a wonderful day!"
- Age ABOVE 80 → say EXACTLY:
  "Thank you so much for your time today — I hope you have a great rest of your day!"
- If age is already known: NEVER ask for age again. Move to the transfer or closing line immediately.

REBUTTAL RULES (each rebuttal is used ONCE per call, no exceptions):
- "Not interested" said ONCE: give a short warm rebuttal (1 sentence) and ask age again.
  Examples:
  "I completely understand — all I need is your age to check if this is even available in your area, no obligation at all. How old are you?"
  "That's totally fine — may I just ask how old you are real quick? Just to check eligibility, takes one second."
- "Not interested" said TWICE or more: say ONLY "Okay, no problem at all — thank you for your time and have a great day!" then stop.
  Do NOT push again, do NOT offer another rebuttal. The call is over.
- Any other single objection (already have insurance, cost, scam, callback later, spouse, fixed income) gets ONE rebuttal sentence
  ending in the age question. If the customer raises the exact same objection again after that, do not repeat the same rebuttal —
  briefly acknowledge and move straight to asking for their age, or if they clearly want to end the call, close politely.

INTERRUPTION RULE (most important):
- When the customer speaks mid-sentence, the agent stops talking immediately.
- Respond to exactly what they said — you already understood it the first time.
- Do NOT say "as I was saying," do NOT resume the pitch from where it left off, and do NOT ask them to repeat themselves.
- After directly addressing their comment/question, naturally ask their age if it hasn't been collected yet.

OTHER OBJECTIONS:
- "Already have insurance": "That's great — final expense is specifically for funeral and burial costs which regular life insurance often doesn't fully cover. May I ask how old you are to check eligibility?"
- "How much does it cost?": "It depends on age and coverage amount — the specialist gives the exact number. May I ask how old you are?"
- "Is this a scam?": "This is a licensed insurance campaign — no payment is taken on this call and you're not obligated to anything. May I ask how old you are?"
- "Call me back / send mail": "Of course — may I grab your callback number? And may I ask how old you are so I can note your eligibility?"
- "Need to talk to spouse": "Totally makes sense. May I ask how old you are so I have that noted when we follow up?"
- Do-not-call request: "Understood — I'll remove you from our list right away. Have a great day!" then stop.

AI DISCLOSURE — NEVER SKIP:
If asked "are you AI / a bot / a real person": answer honestly.
"I'm a virtual assistant handling the intro and eligibility check — then a real licensed specialist takes over. Happy to answer questions in the meantime."
Never claim to be human.

DISCLOSURES: This call may be recorded. No obligation to purchase. No payment collected today.

Keep replies SHORT — 1 to 2 sentences only. This is a live phone call.
"""


def new_call_session(customer_first_name="there", agent_name=None,
                     vicidial_call_id=None, vicidial_lead_id=None,
                     vicidial_campaign_id=None,
                     campaign_script=None, campaign_rebuttals=None,
                     kb_context=None, agent_voice=None):
    """Call this at the very start of every call. Wipes history, state,
    picks/receives the agent name, and rebuilds the pitch + system prompt
    with the customer's first name baked in.

    Args:
        campaign_script:    Optional custom system prompt for this campaign.
                            If provided, overrides the built-in prompt entirely.
        campaign_rebuttals: Optional dict of objection → rebuttal text.
                            If provided, injected into the system prompt.
        kb_context:         Optional string of knowledge base content to append.
                            ALWAYS appended to the system prompt regardless of
                            whether a custom script or default prompt is used.
                            This enables post-call learning to feed into future calls.

    VICIdial Integration:
        If vicidial_call_id is provided, the agent runs in VICIdial mode.
        In this mode, audio is handled by the VICIdial AGI bridge (not
        local sounddevice), and the agent communicates via the HTTP API.
    """
    global AGENT_NAME, CUSTOMER_NAME, PITCH_A, PITCH_B, SYSTEM_PROMPT, history, _current_voice

    # Set voice for this call
    _current_voice = agent_voice or EDGE_VOICE

    AGENT_NAME    = agent_name or "Agent"
    CUSTOMER_NAME = customer_first_name or "there"
    PITCH_A, PITCH_B = build_pitches(CUSTOMER_NAME, AGENT_NAME)  # both are the same now

    # Build the system prompt — always start from the default as the base
    if campaign_script and campaign_script.strip():
        # Custom script overrides the entire prompt
        SYSTEM_PROMPT = campaign_script.strip()
    else:
        # Default prompt with all rules (age, rebuttals, disclosure, etc.)
        SYSTEM_PROMPT = build_system_prompt(AGENT_NAME)

    # Append custom rebuttals on top of whatever prompt we have
    if campaign_rebuttals and isinstance(campaign_rebuttals, dict):
        rebuttal_lines = []
        for key, text in campaign_rebuttals.items():
            if text and text.strip():
                rebuttal_lines.append(f'- "{key}": "{text.strip()}"')
        if rebuttal_lines:
            SYSTEM_PROMPT += "\n\nCUSTOM REBUTTALS (use these when customer gives specific objections):\n" + "\n".join(rebuttal_lines)

    # ALWAYS append knowledge base context at the end (never lost, always used)
    if kb_context and kb_context.strip():
        SYSTEM_PROMPT += f"\n\n---\nKNOWLEDGE BASE (learned from previous calls — use these insights):\n{kb_context.strip()}"

    history       = [{"role": "system", "content": SYSTEM_PROMPT}]
    reset_call_state()

    # Set VICIdial mode if call_id is provided
    if vicidial_call_id:
        call_state["vicidial_mode"] = True
        call_state["vicidial_call_id"] = vicidial_call_id
        call_state["vicidial_lead_id"] = vicidial_lead_id
        call_state["vicidial_campaign_id"] = vicidial_campaign_id


def trim_history():
    if len(history) > MAX_HISTORY_MESSAGES + 1:
        history[:] = [history[0]] + history[-MAX_HISTORY_MESSAGES:]

# ============================================================
#  TTS  →  WAV
# ============================================================
def _tts_to_wav_sync(text):
    """Generate TTS audio and return path to WAV file.

    Voice selection logic:
    - Default voice (en-US-GuyNeural) → gTTS (Google, ~1s, fast)
    - Custom voice (set in Agent page) → edge-tts (Microsoft, supports many voices)
    - Fallback → HTTP TTS server
    """
    global _tts_ready, _ffmpeg_path, _current_voice

    voice = _current_voice or EDGE_VOICE
    is_default_voice = (voice == "en-US-GuyNeural")

    # --- CUSTOM VOICE: Use edge-tts (supports many voices like Ana, Jenny, etc.) ---
    if not is_default_voice:
        try:
            t0 = time.time()
            import edge_tts as _edge
            import asyncio

            async def _do_edge():
                communicate = _edge.Communicate(text, voice)
                wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
                os.close(wav_fd)
                await communicate.save(wav_path)
                return wav_path

            wav_path = asyncio.run(_do_edge())
            total = time.time() - t0
            print(f"   [TTS {total:.2f}s (edge-tts voice={voice})]")
            return wav_path
        except Exception as e:
            print(f"   [TTS edge-tts failed: {e}, falling back]")

    # --- DEFAULT VOICE: Use gTTS (fastest, ~1s) ---
    if _tts_ready:
        try:
            t0 = time.time()
            tts = gTTS(text=text, lang="en", slow=False)
            mp3_buf = _io.BytesIO()
            tts.write_to_fp(mp3_buf)
            mp3_bytes = mp3_buf.getvalue()
            gen_time = time.time() - t0

            mp3_fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
            os.close(mp3_fd)
            with open(mp3_path, "wb") as f:
                f.write(mp3_bytes)

            wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
            os.close(wav_fd)

            _sp.run(
                [_ffmpeg_path, "-y", "-i", mp3_path,
                 "-acodec", "pcm_s16le", "-ar", "16000",
                 "-ac", "1", wav_path],
                capture_output=True, timeout=15
            )
            os.unlink(mp3_path)
            total = time.time() - t0
            print(f"   [TTS {total:.2f}s (gTTS {gen_time:.2f}s + convert {total-gen_time:.2f}s)]")
            return wav_path
        except Exception as e:
            print(f"   [TTS gTTS failed: {e}, trying HTTP fallback]")

    # --- FALLBACK: HTTP TTS server ---
    api_url = os.getenv("TTS_API_URL", "http://localhost:8000/tts")
    api_key = os.getenv("TTS_API_KEY", "")
    try:
        resp = requests.post(api_url,
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            json={"text": text, "voice": voice},
            timeout=30)
        if resp.status_code != 200:
            return None
        content = resp.content
        ct = resp.headers.get("content-type", "")
        if "wav" in ct or content[:4] == b"RIFF":
            wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
            os.close(wav_fd)
            with open(wav_path, "wb") as f:
                f.write(content)
            return wav_path
        if "mpeg" in ct or content[:3] == b"ID3":
            mp3_fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
            os.close(mp3_fd)
            with open(mp3_path, "wb") as f:
                f.write(content)
            wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
            os.close(wav_fd)
            _sp.run([_ffmpeg_path, "-y", "-i", mp3_path,
                     "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wav_path],
                    capture_output=True, timeout=15)
            os.unlink(mp3_path)
            return wav_path
        wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
        os.close(wav_fd)
        with open(wav_path, "wb") as f:
            f.write(content)
        return wav_path
    except Exception as e:
        print(f"   [TTS HTTP error: {e}]")
        return None


def generate_wav(text):
    t0   = time.time()
    path = _tts_to_wav_sync(text)
    if path:
        print(f"   [TTS {time.time()-t0:.2f}s]")
    return path

# ============================================================
#  AUDIO UTILITIES
# ============================================================
def normalize_audio(audio_int16):
    if not NORMALIZE_AUDIO or len(audio_int16) == 0:
        return audio_int16
    fa  = audio_int16.astype(np.float32)
    rms = float(np.sqrt(np.mean(fa ** 2)))
    if rms < 1.0:
        return audio_int16
    gain       = min(NORMALIZE_TARGET_RMS / rms, NORMALIZE_MAX_GAIN)
    normalized = np.clip(fa * gain, -32767, 32767).astype(np.int16)
    return normalized


def audio_has_speech(audio):
    chunk_size = int(SAMPLE_RATE * 0.1)
    energy     = float(np.abs(audio).mean())
    if energy < MIN_SPEECH_ENERGY:
        print(f"   [Gate FAIL: energy {energy:.1f}]")
        return False
    voiced = sum(
        1 for i in range(0, len(audio) - chunk_size, chunk_size)
        if float(np.abs(audio[i:i+chunk_size]).mean()) > SILENCE_THRESHOLD
    )
    if voiced < MIN_VOICED_CHUNKS:
        print(f"   [Gate FAIL: voiced={voiced}]")
        return False
    print(f"   [Gate PASS: energy={energy:.1f}, voiced={voiced}]")
    return True


def transcribe(wav_path):
    try:
        t0 = time.time()
        with open(wav_path, "rb") as f:
            result = client.audio.transcriptions.create(
                file=f, model="whisper-large-v3-turbo", language="en"
            )
        print(f"   [STT {time.time()-t0:.2f}s]")
        return result.text.strip()
    except Exception as e:
        print(f"   [STT error: {e}]")
        return None


def save_and_transcribe(audio_int16, path="mic_input.wav"):
    wav.write(path, SAMPLE_RATE, normalize_audio(audio_int16))
    return transcribe(path)

# ============================================================
#  CALL LOGIC HELPERS
# ============================================================
def extract_age(text):
    if not text:
        return None
    m = re.search(r"\b(\d{2})\b", text)
    if m:
        age = int(m.group(1))
        if 18 <= age <= 110:
            return age
    # word-form fallback (compound entries first, then singles)
    word_groups = [
        (["fifty-five", "fifty five"], 55), (["fifty-four", "fifty four"], 54),
        (["fifty-three", "fifty three"], 53), (["fifty-two", "fifty two"], 52),
        (["fifty-one", "fifty one"], 51), (["fifty"], 50),
        (["sixty-five", "sixty five"], 65), (["sixty-four", "sixty four"], 64),
        (["sixty-three", "sixty three"], 63), (["sixty-two", "sixty two"], 62),
        (["sixty-one", "sixty one"], 61), (["sixty"], 60),
        (["seventy-five", "seventy five"], 75), (["seventy-four", "seventy four"], 74),
        (["seventy-three", "seventy three"], 73), (["seventy-two", "seventy two"], 72),
        (["seventy-one", "seventy one"], 71), (["seventy"], 70),
        (["eighty-five", "eighty five"], 85), (["eighty-four", "eighty four"], 84),
        (["eighty-three", "eighty three"], 83), (["eighty-two", "eighty two"], 82),
        (["eighty-one", "eighty one"], 81), (["eighty"], 80),
        (["ninety-five", "ninety five"], 95), (["ninety-four", "ninety four"], 94),
        (["ninety-three", "ninety three"], 93), (["ninety-two", "ninety two"], 92),
        (["ninety-one", "ninety one"], 91), (["ninety"], 90),
    ]
    tl = text.lower()
    for variants, age in word_groups:
        if any(v in tl for v in variants):
            return age
    return None


def is_not_interested(text):
    if not text:
        return False
    t = text.lower()
    triggers = [
        "not interested", "no thank", "no thanks", "don't want",
        "do not want", "not for me", "not now", "no i'm not",
        "no i am not", "nope", "no thank you", "not today",
    ]
    return any(p in t for p in triggers)


def is_do_not_call(text):
    if not text:
        return False
    t = text.lower()
    triggers = ["remove me", "take me off", "don't call", "do not call",
                "stop calling", "do not call list", "stop calling me"]
    return any(p in t for p in triggers)


def is_stop_command(text):
    if not text:
        return False
    c = text.lower().strip().rstrip(".!?")
    return c in {"stop", "stop talking", "be quiet", "quiet", "shut up", "hold on", "wait"}


def get_llm_reply(user_text):
    history.append({"role": "user", "content": user_text})
    trim_history()
    try:
        t0   = time.time()
        resp = client.chat.completions.create(
            model    = LLM_MODEL,
            messages = history,
            max_tokens = MAX_REPLY_TOKENS,
        )
        reply = resp.choices[0].message.content.strip()
        print(f"   [LLM {time.time()-t0:.2f}s ({LLM_MODEL})]")
    except Exception as e:
        print(f"   [LLM error: {e}]")
        reply = "Sorry, could you say that again?"
    history.append({"role": "assistant", "content": reply})
    return reply


def process_text(text):
    """
    Decide what the agent says next based on what the customer said.
    Returns reply string, or None if nothing to say yet.
    """
    if not text:
        return None

    print("Customer:", text)

    # Do-not-call → end immediately
    if is_do_not_call(text):
        call_state["call_ended"] = True
        call_state["vicidial_disposition"] = "DNC"
        return "Understood — I'll remove you from our list right away. Have a great day!"

    # Stop/hold → pause and wait
    if is_stop_command(text):
        return "Of course — take your time."

    # Age check — only if not already collected
    if call_state["age_collected"] is None:
        age = extract_age(text)
        if age is not None:
            call_state["age_collected"] = age
            call_state["call_ended"]    = True

            if 50 <= age <= 80:
                call_state["call_transferred"] = True
                # Set VICIdial transfer destination (for AGI bridge)
                call_state["vicidial_transfer_dest"] = os.getenv(
                    "VICIDIAL_DEFAULT_QUEUE", "200"
                )
                call_state["vicidial_disposition"] = "XFER"
                return (
                    "Perfect — you sound like a great fit for this program. Now it's time to "
                    "connect your call to my verification department — he will further assist "
                    "you. Please stay on the line."
                )
            elif age < 50:
                call_state["vicidial_disposition"] = "UNDERAGE"
                return (
                    "Thank you so much for your time — unfortunately you don't meet the eligibility "
                    "criteria for this program at this time. I appreciate you speaking with me and "
                    "hope you have a wonderful day!"
                )
            else:  # age > 80
                call_state["vicidial_disposition"] = "OVERAGE"
                return "Thank you so much for your time today — I hope you have a great rest of your day!"

    # Not interested
    if is_not_interested(text):
        call_state["not_interested_count"] += 1
        if call_state["not_interested_count"] >= 2:
            call_state["call_ended"] = True
            call_state["vicidial_disposition"] = "NI"
            return "Okay, no problem at all — thank you for your time and have a great day!"
        # First time — LLM does a natural, single rebuttal
        return get_llm_reply(
            f"[Customer said not interested for the first time. "
            f"Give ONE short warm rebuttal sentence and ask their age. "
            f"Their exact words: {text}]"
        )

    # Everything else (objections, questions, "are you AI", etc.) — LLM handles it
    # following the single-rebuttal / age-only rules in the system prompt.
    return get_llm_reply(text)

# ============================================================
#  SPEAK WITH BARGE-IN
# ============================================================
def speak_with_barge_in(reply_text, allow_barge_in=True):
    """
    Speaks reply_text while listening for the customer to interrupt.
    When barge-in is detected:
      - Stops playback immediately
      - Captures what the customer said, starting from the exact moment
        they started talking (not from whenever we get around to opening
        a fresh mic stream)
      - Returns (interrupted=True, captured_audio)
    The caller is expected to feed captured_audio straight into
    transcribe/process_text — the customer is never asked to repeat.

    allow_barge_in=False: plays the full line no matter what (used for the
    closing/transfer line — it must never get cut off mid-sentence).

    IMPORTANT FIX: previously, when a barge-in was detected, this function
    closed the InputStream and opened a brand-new one just to capture the
    customer's speech. That meant:
      1) The chunks that actually triggered detection (the real beginning
         of what the customer said) were read only to check volume and
         then discarded — never saved into any buffer.
      2) The new capture stream then did a fixed 4-chunk (~400ms) "flush"
         assuming leftover speaker bleed, which ate even more of the start
         of the sentence.
    Together that clipped off the first ~500-600ms of the customer's
    speech, which is why only the tail end ("...interested") was ever
    transcribed instead of the full sentence ("I'm not interested").

    Fix: keep a small rolling buffer of the last few chunks *before* the
    interrupt threshold is crossed, seed the capture buffer with that, and
    keep reading from the SAME stream (no close/reopen, no blind flush).
    """
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', reply_text.strip()) if s.strip()]

    if not allow_barge_in:
        for s in sentences:
            if call_state["call_ended"]:
                break
            path = generate_wav(s)
            if not path:
                continue
            print(f"Agent: {s}")
            try:
                data, sr = sf.read(path, dtype='float32')
                duration = len(data) / sr
                sd.play(data, sr, device=OUTPUT_DEVICE)
                # Poll for call_ended while playing (instead of blocking sd.wait())
                play_start = time.time()
                while time.time() - play_start < duration:
                    if call_state["call_ended"]:
                        sd.stop()
                        break
                    time.sleep(0.05)
                sd.stop()  # ensure stopped
            except Exception as e:
                print(f"   [speak error: {e}]")
            try: os.unlink(path)
            except: pass
        return False, None

    pending  = queue.Queue()
    gen_done = threading.Event()

    def generate_all():
        for s in sentences:
            pending.put(generate_wav(s))
        gen_done.set()

    threading.Thread(target=generate_all, daemon=True).start()

    chunk_size   = int(SAMPLE_RATE * 0.1)
    grace_chunks = int(INTERRUPT_GRACE_SECS / 0.1)

    interrupted    = False
    captured_audio = None
    pre_roll       = []   # onset chunks captured right before/at trigger time

    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                            dtype='int16', device=INPUT_DEVICE) as stream:

            for sentence in sentences:
                if call_state["call_ended"]:
                    break
                # Wait for WAV to be ready
                path = None
                while path is None:
                    if call_state["call_ended"]:
                        break
                    try:
                        path = pending.get(timeout=0.05)
                    except queue.Empty:
                        if gen_done.is_set() and pending.empty():
                            break
                if path is None:
                    continue

                print(f"Agent: {sentence}")

                try:
                    data, sr = sf.read(path, dtype='float32')
                except Exception as e:
                    print(f"   [Read error: {e}]")
                    try: os.unlink(path)
                    except: pass
                    continue

                duration   = len(data) / sr
                play_start = time.time()
                sd.play(data, sr, device=OUTPUT_DEVICE)

                # Phase 1 — Grace: drain mic, never trigger barge-in
                for _ in range(grace_chunks):
                    if time.time() - play_start >= duration:
                        break
                    stream.read(chunk_size)

                # Phase 2 — Measure speaker bleed
                bleed_samples = []
                for _ in range(BLEED_MEASURE_CHUNKS):
                    if time.time() - play_start >= duration:
                        break
                    c, _ = stream.read(chunk_size)
                    bleed_samples.append(float(np.abs(c).mean()))
                bleed     = float(np.percentile(bleed_samples, 90)) if bleed_samples else 0.0
                threshold = max(INTERRUPT_FLOOR, bleed * INTERRUPT_RATIO)
                print(f"   [bleed={bleed:.1f} threshold={threshold:.1f}]")

                # Phase 3 — Active listen for barge-in.
                # Keep a rolling window of recent chunks so that once we
                # cross the trigger, we already have the real onset of the
                # customer's speech in hand (instead of throwing it away).
                hits          = 0
                stopped_early = False
                onset_window  = []

                while time.time() - play_start < duration:
                    if call_state["call_ended"]:
                        sd.stop()
                        interrupted = True
                        stopped_early = True
                        break
                    chunk, _ = stream.read(chunk_size)
                    vol       = float(np.abs(chunk).mean())

                    onset_window.append(chunk)
                    if len(onset_window) > ONSET_ROLLING_CHUNKS:
                        onset_window.pop(0)

                    if vol > threshold:
                        hits += 1
                        if hits >= INTERRUPT_HITS_NEEDED:
                            sd.stop()
                            interrupted   = True
                            stopped_early = True
                            pre_roll      = list(onset_window)  # seed with onset
                            print(f"\n   [Barge-in detected vol={vol:.1f}]")
                            break
                    else:
                        hits = 0

                if not stopped_early:
                    # Poll for call_ended instead of blocking sd.wait()
                    play_end = time.time()
                    remaining = duration - (play_end - play_start)
                    if remaining > 0:
                        while time.time() - play_end < remaining:
                            if call_state["call_ended"]:
                                sd.stop()
                                break
                            time.sleep(0.05)
                        sd.stop()

                try: os.unlink(path)
                except: pass

                if interrupted:
                    break

            # -- Continue capturing on the SAME stream (no reopen, no gap,
            #    no blind flush). We already have the true onset in pre_roll.
            if interrupted:
                # If call was ended by user, skip capture entirely
                if call_state["call_ended"]:
                    interrupted = False
                    captured_audio = None
                else:
                    sil_needed = int(INTERRUPT_SILENCE_SECS / 0.1)
                    min_chunks = int(INTERRUPT_MIN_SECS     / 0.1)
                    max_chunks = int(INTERRUPT_MAX_SECS     / 0.1)

                    buf     = list(pre_roll)
                    sil_cnt = 0
                    n       = len(buf)
                    print("   [Capturing (continuous, no audio lost)...]")

                    while n < max_chunks:
                        if call_state["call_ended"]:
                            break
                        chunk, _ = stream.read(chunk_size)
                        vol = float(np.abs(chunk).mean())
                        buf.append(chunk)
                        n += 1

                        if vol > SILENCE_THRESHOLD:
                            sil_cnt = 0
                        else:
                            sil_cnt += 1
                            if n >= min_chunks and sil_cnt >= sil_needed:
                                break

                    if buf:
                        audio = np.concatenate(buf)
                        if audio_has_speech(audio) and len(audio) / SAMPLE_RATE >= INTERRUPT_MIN_SECS:
                            captured_audio = audio

    except Exception as e:
        print(f"   [speak error: {e}]")

    return interrupted, captured_audio

# ============================================================
#  LISTEN (normal turn — customer speaking unprompted)
# ============================================================
def listen_for_speech():
    chunk_size = int(SAMPLE_RATE * 0.1)
    sil_chunks = int(SILENCE_DURATION / 0.1)
    settle     = max(1, int((POST_SPEECH_SETTLE_MS / 1000) / 0.1))

    buf     = []
    sil_cnt = 0
    spoken  = False

    print("Listening...")

    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                            dtype='int16', device=INPUT_DEVICE) as stream:
            for _ in range(MIC_FLUSH_CHUNKS + settle):
                stream.read(chunk_size)

            n          = 0
            max_chunks = int(MAX_RECORD_DURATION / 0.1)
            while n < max_chunks:
                if call_state["call_ended"]:
                    break
                chunk, _ = stream.read(chunk_size)
                vol = float(np.abs(chunk).mean())
                buf.append(chunk)
                n += 1

                if n % 5 == 0:
                    label = "SPEECH" if vol > SILENCE_THRESHOLD else "quiet"
                    print(f"   [mic={vol:.1f} | {label}]", end="\r")

                if vol > SILENCE_THRESHOLD:
                    spoken  = True
                    sil_cnt = 0
                elif spoken:
                    sil_cnt += 1
                    if sil_cnt >= sil_chunks:
                        break

    except Exception as e:
        print(f"   [Mic error: {e}]")
        return None

    print()
    if not spoken or not buf:
        return None

    audio = np.concatenate(buf)
    if len(audio) / SAMPLE_RATE < 0.3:
        return None
    return audio if audio_has_speech(audio) else None

# ============================================================
#  ONE FULL CALL
# ============================================================
def run_call(customer_first_name="there", agent_name=None, agent_voice=None,
             campaign_script=None, campaign_rebuttals=None, kb_context=None):
    """
    Runs a single, self-contained call from pitch to close.
    customer_first_name: pass in the lead's first name (e.g. from VICIdial's
                          call data) so the pitch says "Hi John, ..." — if
                          not available, it falls back to "Hi there, ...".
    agent_name:           optional override; otherwise picked at random per call.
    agent_voice:          optional voice override (e.g. 'en-US-AnaNeural').
                          When set, uses edge-tts with that voice instead of gTTS.
    campaign_script:      optional custom system prompt for this campaign.
    campaign_rebuttals:   optional dict of objection → rebuttal text.
    kb_context:           optional knowledge base content to append to system prompt.
    """
    new_call_session(
        customer_first_name=customer_first_name,
        agent_name=agent_name,
        agent_voice=agent_voice,
        campaign_script=campaign_script,
        campaign_rebuttals=campaign_rebuttals,
        kb_context=kb_context,
    )

    print(f"\nAgent: {AGENT_NAME}  |  Customer: {CUSTOMER_NAME}")
    print("=" * 50)

    # Pick pitch and speak it first
    pitch = random.choice([PITCH_A, PITCH_B])
    history.append({"role": "assistant", "content": pitch})

    interrupted, captured = speak_with_barge_in(pitch)

    # If customer interrupted the pitch — respond immediately, no repeat-asks
    if interrupted and captured is not None:
        text = save_and_transcribe(captured)
        if text:
            reply = process_text(text)
            if reply:
                history.append({"role": "assistant", "content": reply})
                interrupted, captured = speak_with_barge_in(reply, allow_barge_in=not call_state["call_ended"])
                if call_state["call_ended"]:
                    print("\nCall complete.\n")
                    return
            else:
                interrupted, captured = False, None
        else:
            interrupted, captured = False, None
    else:
        interrupted, captured = False, None

    # Silence timeout tracking
    call_state["last_spoke_time"] = time.time()

    # Main loop
    while not call_state["call_ended"]:
        try:
            t0 = time.time()

            # Auto-end if no speech for NO_SPEECH_TIMEOUT seconds
            if time.time() - call_state["last_spoke_time"] >= NO_SPEECH_TIMEOUT:
                call_state["call_ended"] = True
                print("\n[Call ended — no speech for 20s]\n")
                break

            # If we already have captured audio from a barge-in, use it directly
            # instead of opening a fresh listen window (never ask to repeat).
            if interrupted and captured is not None:
                audio       = captured
                interrupted = False
                captured    = None
            else:
                audio = listen_for_speech()

            if audio is None:
                print("(nothing heard)\n")
                continue

            call_state["last_spoke_time"] = time.time()

            text = save_and_transcribe(audio)
            if not text:
                print("(transcription failed)\n")
                continue

            reply = process_text(text)
            if not reply:
                continue

            history.append({"role": "assistant", "content": reply})
            interrupted, captured = speak_with_barge_in(reply, allow_barge_in=not call_state["call_ended"])

            # Barge-in during reply — process immediately without another listen()
            while interrupted and captured is not None and not call_state["call_ended"]:
                next_text = save_and_transcribe(captured)
                interrupted, captured = False, None
                if next_text:
                    next_reply = process_text(next_text)
                    if next_reply:
                        history.append({"role": "assistant", "content": next_reply})
                        interrupted, captured = speak_with_barge_in(next_reply, allow_barge_in=not call_state["call_ended"])

            print(f"Turn: {time.time()-t0:.2f}s\n")

        except KeyboardInterrupt:
            print("\nCall ended by operator.")
            break
        except Exception as e:
            print(f"[Error: {e}]\n")
            continue

    print("\nCall complete.\n")


# ============================================================
#  AUTONOMOUS LEARNING — Post-Call Knowledge Base Enrichment
# ============================================================

LEARNING_MODEL = "llama-3.1-8b-instant"  # fast model for post-call learning


def learn_from_call(transcript: str, campaign_id: int = None) -> dict:
    """
    Called AFTER a call ends. Analyzes the full conversation transcript
    using the LLM and extracts structured learnings:

    - Objections the customer raised
    - Rebuttals that worked / didn't work
    - Customer behavior patterns (tone, intent, sentiment)
    - Pitch elements that resonated
    - New knowledge to store for future calls
    - Suggested improvements to the pitch or rebuttals

    Returns a dict with structured insights, or an empty dict on failure.
    """
    if not transcript or not transcript.strip():
        return {"error": "empty transcript"}

    learning_prompt = f"""You are an AI call analyst. Your job is to analyze a sales call transcript and extract
structured learnings that will make the agent smarter on future calls.

TRANSCRIPT:
{transcript}

Analyze this conversation carefully and return ONLY valid JSON with these fields.
Do NOT include any text outside the JSON object.

{{
  "objections_raised": [
    {{"objection": "the exact objection the customer said", "count": 1, "handled": true/false}}
  ],
  "rebuttals_that_worked": [
    "exact rebuttal text that got a positive response or got the customer to answer"
  ],
  "rebuttals_that_failed": [
    "exact rebuttal text that the customer rejected or ignored"
  ],
  "customer_behavior": {{
    "tone": "positive/neutral/negative/skeptical/rushed",
    "intent": "interested/not_interested/unsure/angry",
    "key_concerns": ["concern1", "concern2"]
  }},
  "pitch_insights": {{
    "what_resonated": "any part of the pitch that got a positive reaction",
    "what_fell_flat": "any part that got a negative or no reaction",
    "suggested_pitch_tweak": "how to improve the pitch based on this call"
  }},
  "new_knowledge": [
    {{"title": "short title for the insight", "content": "detailed information the agent should know for future calls"}}
  ],
  "suggested_rebuttals": {{
    "objection_key": "rebuttal text that should be tried next time"
  }},
  "summary": "one-sentence summary of what was learned from this call"
}}
"""

    try:
        resp = client.chat.completions.create(
            model=LEARNING_MODEL,
            messages=[{"role": "user", "content": learning_prompt}],
            max_tokens=1000,
            temperature=0.3,
        )
        raw = resp.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            raw = raw.rsplit("\n", 1)[0]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        import json
        insights = json.loads(raw)
        print(f"\n   [LEARN] Extracted insights from call (campaign {campaign_id})")
        print(f"   [LEARN] Objections: {len(insights.get('objections_raised', []))}")
        print(f"   [LEARN] New knowledge items: {len(insights.get('new_knowledge', []))}")
        return insights

    except Exception as e:
        print(f"   [LEARN Error] Failed to analyze transcript: {e}")
        return {"error": str(e)}


def update_knowledge_base(insights: dict, campaign_id: int) -> bool:
    """
    Takes structured insights from learn_from_call() and persists them:
    - Creates new knowledge_documents entries
    - Updates campaign rebuttals JSON with refined rebuttals
    - Call this with the campaign_id to enrich the campaign's knowledge base

    Returns True on success, False on failure.
    """
    if not insights or "error" in insights:
        return False

    try:
        from backend.database import get_db
        import json

        saved = 0

        with get_db() as db:
            # 1. Save new knowledge items
            for item in insights.get("new_knowledge", []):
                title = item.get("title", "").strip()
                content = item.get("content", "").strip()
                if title and content:
                    db.execute(
                        "INSERT INTO knowledge_documents (campaign_id, title, content) VALUES (?, ?, ?)",
                        (campaign_id, title, content),
                    )
                    saved += 1
                    print(f"   [LEARN] Saved KB doc: '{title}'")

            # 2. Update campaign rebuttals with suggested rebuttals
            suggested = insights.get("suggested_rebuttals", {})
            if suggested:
                row = db.execute(
                    "SELECT rebuttals FROM campaigns WHERE id = ?", (campaign_id,)
                ).fetchone()
                existing = {}
                if row and row["rebuttals"]:
                    try:
                        existing = json.loads(row["rebuttals"])
                    except:
                        existing = {}

                merged = {**existing, **suggested}
                db.execute(
                    "UPDATE campaigns SET rebuttals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (json.dumps(merged), campaign_id),
                )
                print(f"   [LEARN] Updated campaign rebuttals: +{len(suggested)} new entries")

            # 3. Store a summary insight as a KB document
            summary = insights.get("summary", "").strip()
            if summary:
                db.execute(
                    "INSERT INTO knowledge_documents (campaign_id, title, content) VALUES (?, ?, ?)",
                    (campaign_id, f"Call Learning Summary ({time.strftime('%Y-%m-%d %H:%M')})", summary),
                )
                print(f"   [LEARN] Saved learning summary")

        print(f"   [LEARN] Knowledge base updated: {saved} new documents")
        return True

    except Exception as e:
        print(f"   [LEARN Error] Failed to update knowledge base: {e}")
        return False


def learn_and_update(transcript: str, campaign_id: int = None) -> dict:
    """
    Convenience function: analyze transcript, then save insights to DB.
    Returns the insights dict (or error dict).
    """
    if not campaign_id:
        print("   [LEARN] No campaign_id provided, skipping KB update")
        return {"error": "no campaign_id"}

    insights = learn_from_call(transcript, campaign_id)
    if "error" not in insights:
        update_knowledge_base(insights, campaign_id)
    else:
        print(f"   [LEARN] Skipping KB update due to error: {insights['error']}")

    return insights


def get_vicidial_decision() -> dict:
    """
    Get the AI agent's final decision for VICIdial integration.
    Called by the VICIdial routes after the AI session completes.

    Returns:
        {
            "transfer": bool,           # Should the call be transferred?
            "destination": str,         # Queue/extension to transfer to
            "disposition": str,         # VICIdial disposition code
            "age_collected": int|None,  # Customer's age if collected
            "customer_name": str,       # Customer name
        }
    """
    import os

    if call_state.get("call_transferred"):
        return {
            "transfer": True,
            "destination": call_state.get("vicidial_transfer_dest")
                          or os.getenv("VICIDIAL_DEFAULT_QUEUE", "200"),
            "disposition": call_state.get("vicidial_disposition", "XFER"),
            "age_collected": call_state.get("age_collected"),
            "customer_name": CUSTOMER_NAME or "there",
        }
    else:
        return {
            "transfer": False,
            "destination": None,
            "disposition": call_state.get("vicidial_disposition", "NI"),
            "age_collected": call_state.get("age_collected"),
            "customer_name": CUSTOMER_NAME or "there",
        }


def get_transcript_text():
    lines = []
    for msg in history:
        role = msg["role"]
        content = msg["content"]
        if role == "system":
            continue
        if role == "assistant":
            lines.append(f"Agent: {content}")
        elif role == "user":
            lines.append(f"Customer: {content}")
    return "\n".join(lines)


# ============================================================
#  MAIN (manual/local test run)
# ============================================================
def main():
    run_call(customer_first_name="there")
    print("\n--- TRANSCRIPT ---")
    print(get_transcript_text())


if __name__ == "__main__":
    main()