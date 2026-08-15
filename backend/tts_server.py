"""
Hybrid TTS HTTP Server
Provides fast TTS using multiple backends:
  1. gTTS (Google Translate) - default, fast, natural, free
  2. edge-tts (Microsoft)     - fallback, higher quality
  3. pyttsx3 (Windows SAPI)   - last resort, instant local

Port 8000. Used by agent_campaign.py for text-to-speech.
"""
import os
import sys
import io
import time
import tempfile
import asyncio
import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Add ffmpeg to PATH for pydub (installed via imageio-ffmpeg)
_ffmpeg_path = None
try:
    import imageio_ffmpeg
    _ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(_ffmpeg_path)
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

# Pre-import audio libraries at module level (not per-request)
_pydub_available = False
try:
    from pydub import AudioSegment
    _pydub_available = True
except ImportError:
    pass

# ============================================================
#  BACKENDS
# ============================================================

# -- gTTS (Google Translate TTS - free, fast, natural)
_gtts_available = False
try:
    from gtts import gTTS
    _gtts_available = True
except ImportError:
    pass

# -- pyttsx3 (Windows SAPI - local, instant)
_pyttsx3_available = False
_pyttsx3_engine = None
try:
    import pyttsx3
    _pyttsx3_available = True
    # Pre-warm engine at import time so first call is instant
    _pyttsx3_engine = pyttsx3.init()
    # Set reasonable voice properties
    try:
        voices = _pyttsx3_engine.getProperty("voices")
        for v in voices:
            if "david" in v.name.lower():
                _pyttsx3_engine.setProperty("voice", v.id)
                break
    except:
        pass
    _pyttsx3_engine.setProperty("rate", 175)
    _pyttsx3_engine.setProperty("volume", 1.0)
except Exception:
    pass

app = FastAPI(title="Hybrid TTS Server")

VOICE = os.getenv("EDGE_VOICE", "en-US-GuyNeural")
RATE = os.getenv("EDGE_RATE", "+0%")
VOLUME = os.getenv("EDGE_VOLUME", "+0%")
PITCH = os.getenv("EDGE_PITCH", "+0Hz")


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    rate: Optional[str] = None
    volume: Optional[str] = None
    pitch: Optional[str] = None
    provider: Optional[str] = None  # "auto" | "gtts" | "edge" | "local"


@app.post("/tts")
async def synthesize(req: TTSRequest):
    """Synthesize speech from text and return WAV audio."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    provider = (req.provider or "auto").lower()

    # -- Try gTTS (fastest, but only for default voice - no voice selection)
    voice = req.voice or VOICE
    use_gtts = (provider == "gtts") or (provider == "auto" and voice == VOICE and _gtts_available)
    if use_gtts and _gtts_available:
        try:
            t0 = time.time()
            tts = gTTS(text=req.text, lang="en", slow=False)
            mp3_data = io.BytesIO()
            tts.write_to_fp(mp3_data)
            mp3_bytes = mp3_data.getvalue()
            gen_time = time.time() - t0
            print(f"   [TTS gTTS {gen_time:.2f}s]")
            return Response(content=mp3_bytes, media_type="audio/mpeg")
        except Exception as e:
            print(f"   [TTS gTTS failed: {e}, falling back]")
            if provider == "gtts":
                raise HTTPException(status_code=500, detail=f"gTTS failed: {e}")

    # -- Try edge-tts (Microsoft neural voices)
    if provider in ("auto", "edge"):
        rate = req.rate or RATE
        volume = req.volume or VOLUME
        pitch = req.pitch or PITCH

        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)

        try:
            t0 = time.time()
            communicate = edge_tts.Communicate(req.text, voice, rate=rate, volume=volume, pitch=pitch)
            await communicate.save(path)
            print(f"   [TTS edge-tts {time.time()-t0:.2f}s]")
            return FileResponse(path, media_type="audio/wav", filename="speech.wav")
        except Exception as e:
            try:
                os.unlink(path)
            except:
                pass
            if provider == "edge":
                raise HTTPException(status_code=500, detail=str(e))
            print(f"   [TTS edge-tts failed: {e}, falling back]")

    # -- Fallback: pyttsx3 (Windows SAPI, local, instant)
    if _pyttsx3_available and _pyttsx3_engine:
        try:
            t0 = time.time()
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            _pyttsx3_engine.save_to_file(req.text, path)
            _pyttsx3_engine.runAndWait()
            print(f"   [TTS pyttsx3 {time.time()-t0:.2f}s]")
            return FileResponse(path, media_type="audio/wav", filename="speech.wav")
        except Exception as e:
            try:
                os.unlink(path)
            except:
                pass
            raise HTTPException(status_code=500, detail=f"All TTS backends failed. Last error: {e}")

    raise HTTPException(status_code=500, detail="No TTS backend available. Install gTTS: pip install gtts")


@app.get("/health")
async def health():
    backends = []
    if _gtts_available:
        backends.append("gtts")
    backends.append("edge-tts")
    if _pyttsx3_available:
        backends.append("pyttsx3")
    return {
        "status": "ok",
        "voice": VOICE,
        "backends": backends,
        "default": "gtts" if _gtts_available else "edge-tts",
    }


@app.get("/voices")
async def list_voices():
    """List available US English voices from edge-tts."""
    try:
        voices = await edge_tts.list_voices()
        us_voices = [
            {
                "name": v["ShortName"],
                "friendly_name": v["FriendlyName"],
                "gender": v["Gender"],
                "locale": v["Locale"],
            }
            for v in voices
            if v["Locale"].startswith("en-US")
        ]
        us_voices.sort(key=lambda x: x["friendly_name"])
        return {"voices": us_voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("TTS_PORT", "8000"))
    print(f"TTS Server starting on port {port}")
    print(f"  Backends: gTTS={'[OK]' if _gtts_available else '[X]'} | edge-tts=[OK] | pyttsx3={'[OK]' if _pyttsx3_available else '[X]'}")
    print(f"  Default: {'gTTS (fast)' if _gtts_available else 'edge-tts'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
