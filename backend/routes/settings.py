import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routes.auth_middleware import require_auth
from config import Settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_auth)])


class GlobalSettings(BaseModel):
    default_probe_interval_hours: int = 6


@router.get("")
async def get_settings(settings: Settings = Depends(lambda: Settings())):
    return {
        "default_probe_interval_hours": settings.default_probe_interval_hours,
    }


@router.put("")
async def update_settings(
    body: GlobalSettings,
    settings: Settings = Depends(lambda: Settings()),
):
    settings.default_probe_interval_hours = body.default_probe_interval_hours
    return {"ok": True}