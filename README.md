# AI Calling Agent

An end-to-end AI-powered outbound calling platform. A voice AI agent (Groq LLM + Whisper STT + Edge-TTS) dials leads, holds real conversations, qualifies them, and transfers qualified calls to human agents.

The platform has a **Next.js 16 dashboard** for managing leads, campaigns, agents, and analytics — plus a **FastAPI backend** that runs the AI agent locally (microphone + speakers) or bridges calls through **VICIdial/Asterisk** for production auto-dialing.

---

## Features

- **AI Voice Agent** — natural phone conversations using Groq LLM (`llama-3.1-8b-instant`), Whisper speech-to-text, and Edge-TTS neural voices
- **Live transcript chat** — watch the call in real time, and speak or type to the agent mid-call
- **Campaign scripts & knowledge base** — per-campaign custom prompts, objection rebuttals, and a learned insights KB that improves after every call
- **Automatic qualification** — the agent collects the lead's age and routes 50–80 year-olds to a human specialist (transfer), ending others with the right disposition
- **Barge-in support** — the agent stops speaking the moment the lead interrupts
- **Do-not-call handling** — detects and honors opt-out requests, with a compliance-first prompt
- **VICIdial integration** — FastAGI bridge (port 4573) so VICIdial's auto-dialer routes answered calls into the AI agent
- **Lead management** — CSV import, status tracking, recall, bulk dialing
- **Admin suite** — user management, support tickets, notifications, activity logs, analytics dashboards

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts |
| Backend | FastAPI (Python 3.12), Uvicorn |
| Database | SQLite |
| LLM | Groq — `llama-3.1-8b-instant` |
| Speech-to-Text | Groq — `distil-whisper-large-v3-en` |
| Text-to-Speech | Edge-TTS server (port 8000) |
| Audio I/O | sounddevice, soundfile, scipy |
| Telephony | VICIdial via FastAGI bridge, optional Twilio |

## Architecture

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Next.js 16 │   │  FastAPI     │   │  TTS Server  │   │  VICIdial    │
│  Dashboard  │──▶│  :8002       │──▶│  :8000       │   │  (optional)  │
│  :3000      │   │  routes/     │   │  edge-tts    │   │      │       │
└─────────────┘   └──────┬───────┘   └──────────────┘   └──────┼───────┘
                         │                                      │
                         ▼                                      ▼
                 ┌──────────────┐                      ┌──────────────┐
                 │ AI Agent     │◀──── FastAGI ───────▶│ AGI Handler  │
                 │ agent_campaign.py                  │  :4573        │
                 │ Groq + STT + TTS                   └──────────────┘
                 └──────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Python** >= 3.10
- A **Groq API key** (free at https://console.groq.com) for STT + LLM
- Microphone and speakers (for local voice calls)

### 1. Setup

```bash
# Backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# Frontend dependencies
npm install

# Environment variables
cp .env.example .env    # add your GROQ_API_KEY
```

### 2. Run (one command)

```powershell
.\start.ps1
```

Starts all services:

| Service | URL |
|---------|-----|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API (FastAPI) | http://localhost:8002/api/health |
| TTS Server (Edge-TTS) | http://localhost:8000 |
| AGI Server (VICIdial bridge) | port 4573 |

Or run each service individually:

```bash
python backend/tts_server.py                          # TTS on :8000
cd backend; uvicorn main:app --reload --port 8002     # API on :8002
npm run dev                                           # Frontend on :3000
python backend/agi_handler.py --mode fastagi          # VICIdial AGI on :4573
```

### 3. Login

Default admin account (created automatically on first run):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@empirex.com` | `admin123` |

## How to Make a Call

1. Open the dashboard → **Outbound**
2. Select a campaign
3. Click the **Call** button next to any pending lead
4. A voice call starts on your machine (AI agent speaks via speakers, listens via mic)
5. A chat modal opens with the **live transcript**
6. Speak or type to interact with the agent
7. When the call ends, the transcript and outcome are saved to the database

## VICIdial Integration

The platform bridges production VICIdial auto-dialing with the AI agent:

1. VICIdial auto-dials leads and runs the AGI script on answer
2. The AGI handler (port 4573) bridges call audio to the AI agent
3. The agent speaks the campaign pitch, handles objections, and qualifies the lead by age
4. Qualified leads (age 50–80) are **transferred** to a human agent queue
5. Unqualified or uninterested leads get an appropriate disposition

Configure everything in the UI at `/vicidial` — credentials, campaign, and agent settings are stored in the database and take effect immediately (no restarts).

See [`VICIDIAL_SETUP_GUIDE.md`](VICIDIAL_SETUP_GUIDE.md) and [`deploy/setup-server.sh`](deploy/setup-server.sh) for full setup.

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login |
| GET/POST/PATCH | `/api/campaigns` | Campaign CRUD |
| GET/POST/PATCH | `/api/agents` | AI agent CRUD |
| GET | `/api/leads` | List leads |
| POST | `/api/leads/import` | Bulk import leads |
| POST | `/api/leads/upload-csv` | CSV upload |
| POST | `/api/calling/start-voice-chat` | Start voice call + live chat |
| POST | `/api/calling/start-call` | Voice-only call |
| POST | `/api/calling/start-chat` | Text-only chat |
| GET | `/api/calling/transcript/{session_id}` | Live transcript (poll) |
| POST | `/api/calling/recall/{lead_id}` | Recall a lead |
| GET | `/api/dashboard/kpis` | Dashboard KPIs |
| POST | `/api/vicidial/agent/login` | Log AI agent into VICIdial |
| POST | `/api/vicidial/transfer/{call_id}` | Transfer call to human |
| POST | `/api/vicidial/agi-start-call` | AGI callback: call answered |

Full VICIdial surface: 22 endpoints under `/api/vicidial/*` (config, sync, agent, campaign, AGI). See [`SETUP_AND_USAGE.md`](SETUP_AND_USAGE.md) for details.

## Project Structure

```
├── app/                      # Next.js pages (dashboard, outbound, vicidial, admin...)
├── components/               # UI components (layout, dashboard, modals, common)
├── lib/                      # API client, auth context, live data hooks
├── backend/
│   ├── main.py               # FastAPI entry point
│   ├── database.py           # SQLite schema + seed data
│   ├── agent_campaign.py     # AI voice agent (Groq + STT + TTS + audio)
│   ├── tts_server.py         # Edge-TTS HTTP server (:8000)
│   ├── agi_handler.py        # FastAGI server for VICIdial (:4573)
│   ├── vicidial_client.py    # VICIdial API wrapper
│   └── routes/               # API route modules
├── docs/                     # Campaign scripts and guides
├── deploy/                   # Server deployment scripts
└── start.ps1                 # One-command launcher
```

## Configuration

All runtime configuration lives in `.env` (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API key (LLM + STT) |
| `TTS_API_URL` | ✅ | TTS server URL (default `http://localhost:8000/tts`) |
| `LLM_MODEL` | | LLM model (default `llama-3.1-8b-instant`) |
| `TWILIO_*` | | Twilio credentials (optional, Twilio calling mode) |
| `VICIDIAL_*` | | VICIdial credentials (optional, VICIdial integration) |

## License

Private / internal use. Contact the repository owner for usage terms.
