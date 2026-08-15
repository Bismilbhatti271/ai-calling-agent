# Empire-X AI Calling Platform

## How to Run

### Quick Start (all services)
```powershell
.\start.ps1
```

### With VICIdial AGI server
```powershell
.\start.ps1 -VICIdialAGI
```

### Individual services

**1. TTS Server** (edge-tts, port 8000)
```powershell
python backend/tts_server.py
```

**2. Backend API** (FastAPI, port 8002)
```powershell
cd backend; uvicorn main:app --reload --port 8002
```

**3. Frontend** (Next.js, port 3000)
```powershell
npm run dev
```

**4. FastAGI Server** (VICIdial bridge, port 4573)
```powershell
python backend/agi_handler.py --mode fastagi
```

## How Voice + Chat Calling Works (Local Mode)

1. Go to **Outbound** page in the dashboard
2. Select a campaign
3. Click **Call** (phone icon) on any **pending** lead
4. The AI agent starts a **voice call** via your laptop speakers/mic
5. A **chat modal** opens showing the real-time transcript
6. You can **speak** to the agent or **type** in the chat
7. The agent responds via voice (TTS) and the response appears in chat
8. Once the call ends, the transcript is saved

## How VICIdial Integration Works

1. Client gives you VICIdial admin access
2. Go to **VICIdial** page in dashboard (`/vicidial`)
3. Enter the API credentials, campaign details, agent info
4. Click **Test Connection** to verify
5. Click **Login Agent** to log the AI agent into VICIdial
6. VICIdial auto-dials → answered calls route to Empire-X via AGI
7. AI agent talks to leads (Groq LLM + Whisper STT + Edge-TTS)
8. Qualified leads (age 50-80) are **transferred** to human agents in VICIdial
9. Unqualified leads are ended with appropriate disposition

**Key insight:** All config is stored in the database (not env vars).
Changes in the UI take effect **immediately** — no server restart needed.

## Architecture

- **Frontend**: Next.js (TypeScript) - `app/outbound/page.tsx`, `app/vicidial/page.tsx`
- **Backend**: FastAPI (Python) - `backend/routes/calling.py`, `backend/routes/vicidial.py`
- **AI Agent**: `agent_campaign.py` - Groq LLM + sounddevice + edge-tts TTS
- **TTS**: Edge-TTS server on port 8000 - `backend/tts_server.py`
- **Database**: SQLite - `backend/dashboard.db` (includes `vicidial_config` table)
- **VICIdial Bridge**: `backend/agi_handler.py` - FastAGI server on port 4573
- **VICIdial API Client**: `backend/vicidial_client.py` - Full VICIdial API wrapper

## API Endpoints

### Local Calling
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/calling/start-voice-chat | Start voice call + chat session |
| POST | /api/calling/send-message | Send text message during chat |
| GET | /api/calling/transcript/{session_id} | Get live transcript (poll for updates) |
| POST | /api/calling/start-call | Start voice-only call |
| POST | /api/calling/start-chat | Start text-only chat |
| POST | /api/calling/recall/{lead_id} | Recall a lead |

### VICIdial Integration (22 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/vicidial/config | Get VICIdial config (from DB) |
| POST | /api/vicidial/config | Save VICIdial config (to DB) |
| POST | /api/vicidial/config/test | Test API connection |
| POST | /api/vicidial/agent/login | Login AI agent to VICIdial |
| POST | /api/vicidial/agent/logout | Logout AI agent |
| GET | /api/vicidial/agent/status | Get AI agent status |
| POST | /api/vicidial/campaign/start | Start VICIdial campaign |
| POST | /api/vicidial/campaign/stop | Stop VICIdial campaign |
| GET | /api/vicidial/campaign/status | Get campaign status |
| POST | /api/vicidial/sync-leads-to-vicidial | Sync Empire-X leads to VICIdial |
| GET | /api/vicidial/leads | List VICIdial leads |
| POST | /api/vicidial/transfer/{call_id} | Transfer call to human |
| GET | /api/vicidial/sessions | List active sessions |
| GET | /api/vicidial/status | Overall integration status |
| GET | /api/vicidial/dialplan-config | Generate Asterisk dialplan config |
| POST | /api/vicidial/agi-start-call | AGI callback: new call answered |
| GET | /api/vicidial/agi-next-response/{call_id} | AGI: get next AI response text |
| POST | /api/vicidial/agi-process-audio/{call_id} | AGI: process recorded audio |
| GET | /api/vicidial/agi-call-result/{call_id} | AGI: get final decision |
| GET | /api/vicidial/pitch-audio/{call_id} | AGI: get pitch as audio |
| POST | /api/vicidial/tts | Text-to-speech for AGI |

## VICIdial Integration Files

| File | Purpose |
|------|---------|
| `backend/vicidial_client.py` | VICIdial API client (add leads, transfer calls, set dispositions, etc.) |
| `backend/agi_handler.py` | FastAGI server that bridges VICIdial calls to AI agent |
| `backend/routes/vicidial.py` | 22 API endpoints for AGI, config, sync, agent, campaign control |
| `app/vicidial/page.tsx` | Frontend configuration and monitoring dashboard |
| `backend/database.py` | `vicidial_config` table for dynamic settings |
| `lib/api.ts` | TypeScript API client for vicidial endpoints |
| `start.ps1` | Launcher with `-VICIdialAGI` flag for AGI server |
