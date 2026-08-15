import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.database import init_db, seed_initial_data, seed_sample_leads, get_db
from backend.auth import hash_password
from backend.routes import campaigns, agents, calls, dashboard, calling, leads, infrastructure, auth, users, notifications, tickets, vicidial, knowledge_base, dispo_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with get_db() as db:
        existing = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing == 0:
            db.execute(
                "INSERT INTO users (email, password_hash, name, role, phone, avatar, about) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("admin@empirex.com", hash_password("admin123"), "Admin", "admin",
                 "",
                 "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
                 "Platform administrator"),
            )
    seed_initial_data()
    seed_sample_leads()
    yield


app = FastAPI(title="Empire-X Campaign API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(campaigns.router)
app.include_router(agents.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(calling.router)
app.include_router(leads.router)
app.include_router(infrastructure.router)
app.include_router(notifications.router)
app.include_router(tickets.router)
app.include_router(vicidial.router)
app.include_router(knowledge_base.router)
app.include_router(dispo_api.router)



@app.get("/api/health")
def health():
    return {"status": "ok"}
