from datetime import date
from fastapi import APIRouter, Depends
from ..database import get_db
from .auth import get_current_user, require_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def dashboard_kpis(user: dict = Depends(require_user)):
    with get_db() as db:
        today_calls = db.execute(
            "SELECT COUNT(*) as total, SUM(CASE WHEN result IN ('conversion','transferred') THEN 1 ELSE 0 END) as conv FROM calls WHERE date(created_at) = date('now')"
        ).fetchone()

        total_calls_today = today_calls["total"] or 0
        total_conversions_today = today_calls["conv"] or 0
        conversion_rate_today = round((total_conversions_today / total_calls_today * 100), 1) if total_calls_today > 0 else 0

        yesterday_calls = db.execute(
            "SELECT COUNT(*) as total FROM calls WHERE date(created_at) = date('now', '-1 day')"
        ).fetchone()
        yesterday_total = yesterday_calls["total"] or 0

        calls_comparison = round(
            ((total_calls_today - yesterday_total) / yesterday_total * 100), 1
        ) if yesterday_total > 0 else 0

        yesterday_conv = db.execute(
            "SELECT COUNT(*) as total FROM calls WHERE date(created_at) = date('now', '-1 day') AND result IN ('conversion','transferred')"
        ).fetchone()["total"] or 0
        conversion_comparison = round(
            ((total_conversions_today - yesterday_conv) / yesterday_conv * 100), 1
        ) if yesterday_conv > 0 else 0

        active_agents = db.execute("SELECT COUNT(*) as cnt FROM agents WHERE status = 'active'").fetchone()["cnt"]
        active_campaigns = db.execute("SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'active'").fetchone()["cnt"]

        total_revenue = db.execute(
            "SELECT SUM(CASE WHEN result IN ('conversion','transferred') THEN 1 ELSE 0 END) * 40 as rev FROM calls"
        ).fetchone()["rev"] or 0

        avg_duration = db.execute(
            "SELECT AVG(duration_seconds) as avg FROM calls WHERE duration_seconds > 0"
        ).fetchone()["avg"] or 0

        total_calls_all_time = db.execute("SELECT COUNT(*) as cnt FROM calls").fetchone()["cnt"]

        return {
            "total_calls_today": total_calls_today,
            "calls_comparison": calls_comparison,
            "total_conversions_today": total_conversions_today,
            "conversion_rate_today": conversion_rate_today,
            "conversion_comparison": conversion_comparison,
            "active_agents": active_agents,
            "active_campaigns": active_campaigns,
            "total_revenue": round(total_revenue, 2),
            "average_call_duration": round(avg_duration, 0),
            "total_calls_all_time": total_calls_all_time,
        }


@router.get("/usage")
def api_usage(days: int = 30, user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT date(created_at) as date, COUNT(*) as api_calls, "
            "COUNT(*) * 0.01 as cost "
            "FROM calls WHERE created_at >= date('now', ?) "
            "GROUP BY date(created_at) ORDER BY date(created_at)",
            (f"-{days} days",),
        ).fetchall()

    today_str = date.today().isoformat()
    today_count = 0
    for r in rows:
        if r["date"] == today_str:
            today_count = r["api_calls"]
            break

    total_calls = sum(r["api_calls"] for r in rows)
    quota = 100000
    usage_pct = round((total_calls / quota) * 100, 1) if total_calls > 0 else 0

    return {
        "daily": [dict(r) for r in rows],
        "summary": {
            "today_calls": today_count,
            "total_calls": total_calls,
            "quota": quota,
            "usage_percentage": usage_pct,
            "total_cost": round(total_calls * 0.01, 2),
        },
    }


@router.get("/analytics")
def analytics(days: int = 30, user: dict = Depends(require_user)):
    """Get daily analytics data for charts (calls, conversions, failed, avg_duration, rate)."""
    with get_db() as db:
        rows = db.execute("""
            SELECT date(created_at) as date,
                   COUNT(*) as calls_completed,
                   SUM(CASE WHEN result IN ('declined','failed') THEN 1 ELSE 0 END) as calls_failed,
                   SUM(CASE WHEN result IN ('conversion','transferred') THEN 1 ELSE 0 END) as conversions,
                   ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE NULL END), 0) as avg_duration,
                   ROUND(CAST(SUM(CASE WHEN result IN ('conversion','transferred') THEN 1 ELSE 0 END) AS REAL) / CAST(COUNT(*) AS REAL) * 100, 1) as conversion_rate
            FROM calls
            WHERE created_at >= date('now', ?)
            GROUP BY date(created_at)
            ORDER BY date(created_at) ASC
        """, (f"-{days} days",)).fetchall()
        return [dict(r) for r in rows]


@router.get("/calls-by-day")
def calls_by_day(days: int = 7, user: dict = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT date(created_at) as date, COUNT(*) as count, "
            "SUM(CASE WHEN result IN ('conversion','transferred') THEN 1 ELSE 0 END) as conversions "
            "FROM calls WHERE created_at >= date('now', ?) "
            "GROUP BY date(created_at) ORDER BY date(created_at)",
            (f"-{days} days",),
        ).fetchall()
        result = []
        for r in rows:
            total = r["count"]
            conv = r["conversions"]
            result.append({
                "date": r["date"],
                "count": total,
                "conversions": conv,
                "conversion_rate": round((conv / total * 100), 1) if total > 0 else 0,
            })
        return result
