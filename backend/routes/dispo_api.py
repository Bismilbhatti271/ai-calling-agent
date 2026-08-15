"""API route to expose VICIdial disposition codes to the frontend."""

from fastapi import APIRouter
from backend.dispositions import get_all_dispositions, DISPOSITIONS, AI_DISPOSITIONS

router = APIRouter(prefix="/api/dispositions", tags=["dispositions"])


@router.get("")
def list_dispositions():
    """Get all VICIdial disposition codes with labels and categories."""
    return get_all_dispositions()


@router.get("/ai-mapping")
def ai_disposition_mapping():
    """Get the AI agent's outcome-to-disposition mapping."""
    return {"mapping": AI_DISPOSITIONS, "description": "Maps AI agent call outcomes to VICIdial disposition codes"}
