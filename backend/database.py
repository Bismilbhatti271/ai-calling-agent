import os
import sqlite3
from datetime import datetime, date
from typing import Optional
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "dashboard.db")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name          TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'user',
                phone         TEXT NOT NULL DEFAULT '',
                avatar        TEXT NOT NULL DEFAULT '',
                about         TEXT NOT NULL DEFAULT '',
                status        TEXT NOT NULL DEFAULT 'active',
                created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                token      TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS agents (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                model       TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
                voice_type  TEXT NOT NULL DEFAULT 'en-US-GuyNeural',
                status      TEXT NOT NULL DEFAULT 'active',
                created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                total_calls INTEGER NOT NULL DEFAULT 0,
                calls_today INTEGER NOT NULL DEFAULT 0,
                conversion_rate REAL NOT NULL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS campaigns (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             TEXT NOT NULL,
                description      TEXT NOT NULL DEFAULT '',
                agent_id         INTEGER NOT NULL REFERENCES agents(id),
                status           TEXT NOT NULL DEFAULT 'draft',
                target_count     INTEGER NOT NULL DEFAULT 0,
                completed_count  INTEGER NOT NULL DEFAULT 0,
                conversion_count INTEGER NOT NULL DEFAULT 0,
                daily_target     INTEGER NOT NULL DEFAULT 0,
                daily_completed  INTEGER NOT NULL DEFAULT 0,
                created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS calls (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id      INTEGER NOT NULL REFERENCES campaigns(id),
                agent_id         INTEGER NOT NULL REFERENCES agents(id),
                phone_number     TEXT NOT NULL,
                customer_name    TEXT NOT NULL DEFAULT '',
                status           TEXT NOT NULL DEFAULT 'in_progress',
                result           TEXT NOT NULL DEFAULT 'in_progress',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                age_collected    INTEGER,
                outcome_text     TEXT,
                transcript       TEXT,
                created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS leads (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id      INTEGER NOT NULL REFERENCES campaigns(id),
                phone_number     TEXT NOT NULL,
                first_name       TEXT NOT NULL DEFAULT '',
                last_name        TEXT NOT NULL DEFAULT '',
                status           TEXT NOT NULL DEFAULT 'pending',
                call_result      TEXT,
                age_collected    INTEGER,
                notes            TEXT,
                created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                called_at        TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
            CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

            CREATE TABLE IF NOT EXISTS analytics_daily (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                date             TEXT NOT NULL UNIQUE,
                calls_completed  INTEGER NOT NULL DEFAULT 0,
                calls_failed     INTEGER NOT NULL DEFAULT 0,
                conversions      INTEGER NOT NULL DEFAULT 0,
                conversion_rate  REAL NOT NULL DEFAULT 0.0,
                average_duration INTEGER NOT NULL DEFAULT 0,
                total_revenue    REAL NOT NULL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                user_name  TEXT NOT NULL DEFAULT '',
                action     TEXT NOT NULL,
                details    TEXT NOT NULL DEFAULT '',
                ip_address TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                user_name  TEXT NOT NULL,
                subject    TEXT NOT NULL,
                message    TEXT NOT NULL,
                token      TEXT NOT NULL UNIQUE,
                status     TEXT NOT NULL DEFAULT 'open',
                priority   TEXT NOT NULL DEFAULT 'medium',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ticket_replies (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
                user_id    INTEGER NOT NULL REFERENCES users(id),
                user_name  TEXT NOT NULL,
                message    TEXT NOT NULL,
                is_admin   INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
            CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies(ticket_id);
        """)

    # Use fresh connections for migrations (db from the with block above is closed)
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE calls ADD COLUMN transcript TEXT")
        c.close()
    except:
        pass
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE campaigns ADD COLUMN script TEXT DEFAULT ''")
        c.close()
    except:
        pass
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE campaigns ADD COLUMN model TEXT DEFAULT ''")
        c.close()
    except:
        pass
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE campaigns ADD COLUMN rebuttals TEXT DEFAULT '{}'")
        c.close()
    except:
        pass
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE leads ADD COLUMN disposition TEXT DEFAULT ''")
        c.close()
    except:
        pass
    try:
        c = sqlite3.connect(DB_PATH)
        c.execute("ALTER TABLE calls ADD COLUMN disposition TEXT DEFAULT ''")
        c.close()
    except:
        pass

    with get_db() as db:
        try:
            db.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_documents (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER REFERENCES campaigns(id),
                    title       TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
        except:
            pass

    with get_db() as db:
        try:
            db.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    type       TEXT NOT NULL DEFAULT 'info',
                    title      TEXT NOT NULL,
                    message    TEXT NOT NULL DEFAULT '',
                    user_id    INTEGER REFERENCES users(id),
                    is_global  INTEGER NOT NULL DEFAULT 1,
                    is_read    INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
        except:
            pass

    # VICIdial dynamic configuration table
    with get_db() as db:
        try:
            db.execute("""
                CREATE TABLE IF NOT EXISTS vicidial_config (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT ''
                )
            """)
            # Seed default values if table is empty
            existing = db.execute("SELECT COUNT(*) FROM vicidial_config").fetchone()[0]
            if existing == 0:
                defaults = [
                    ("api_url", ""),
                    ("api_user", ""),
                    ("api_pass", ""),
                    ("agent_user", "AI_AGENT_01"),
                    ("agent_pass", ""),
                    ("campaign_id", "AI_CAMPAIGN"),
                    ("default_queue", "200"),
                    ("server_ip", ""),
                    ("mode", "local"),
                    ("connected", "false"),
                    ("last_check", "0"),
                    ("transfer_mode", "internal"),
                ]
                db.executemany(
                    "INSERT INTO vicidial_config (key, value) VALUES (?, ?)",
                    defaults,
                )
        except:
            pass


def get_vicidial_config(key: str = None, default: str = None):
    """
    Get VICIdial configuration from database.

    If key is provided: returns the value for that key (or default).
    If key is None: returns all config as a dict.
    """
    with get_db() as db:
        if key:
            row = db.execute(
                "SELECT value FROM vicidial_config WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else default
        else:
            rows = db.execute("SELECT key, value FROM vicidial_config").fetchall()
            return {row["key"]: row["value"] for row in rows}


def set_vicidial_config(key: str, value: str):
    """Set a VICIdial configuration value in database."""
    with get_db() as db:
        db.execute(
            "INSERT OR REPLACE INTO vicidial_config (key, value) VALUES (?, ?)",
            (key, value),
        )


def seed_sample_leads():
    with get_db() as db:
        existing = db.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        if existing > 0:
            return

        sample_leads = [
            ("John", "Smith", "+15551234567"),
            ("Mary", "Johnson", "+15552345678"),
            ("Robert", "Williams", "+15553456789"),
            ("Patricia", "Brown", "+15554567890"),
            ("Michael", "Jones", "+15555678901"),
            ("Linda", "Garcia", "+15556789012"),
            ("William", "Miller", "+15557890123"),
            ("Barbara", "Davis", "+15558901234"),
            ("James", "Rodriguez", "+15559012345"),
            ("Elizabeth", "Martinez", "+15550123456"),
        ]
        for first, last, phone in sample_leads:
            db.execute(
                "INSERT INTO leads (campaign_id, phone_number, first_name, last_name, status) VALUES (?, ?, ?, ?, 'pending')",
                (1, phone, first, last),
            )


def seed_initial_data():
    with get_db() as db:
        existing = db.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
        if existing > 0:
            return

        db.execute(
            "INSERT INTO agents (name, description, model, voice_type, status, total_calls, calls_today, conversion_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("Jimmy Anderson", "Expert final expense agent", "llama-3.1-8b-instant", "en-US-GuyNeural", "active", 8542, 342, 34.5)
        )
        db.execute(
            "INSERT INTO agents (name, description, model, voice_type, status, total_calls, calls_today, conversion_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("Chris Anderson", "Senior outbound specialist", "llama-3.1-8b-instant", "en-US-GuyNeural", "active", 4123, 156, 28.2)
        )

        db.execute(
            "INSERT INTO campaigns (name, description, agent_id, status, target_count, completed_count, conversion_count, daily_target, daily_completed) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("Final Expense Q3", "Q3 outbound campaign targeting seniors for final expense", 1, "active", 5000, 3847, 1325, 150, 128)
        )
        db.execute(
            "INSERT INTO campaigns (name, description, agent_id, status, target_count, completed_count, conversion_count, daily_target, daily_completed) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("Senior Outreach July", "July senior lead follow-up campaign", 2, "active", 2000, 1456, 312, 80, 92)
        )
