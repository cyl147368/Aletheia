from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import RelayStation
from routes.auth_middleware import require_auth
from crypto import get_crypto

router = APIRouter(prefix="/api/stations", tags=["stations"], dependencies=[Depends(require_auth)])


class StationCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    official_url: Optional[str] = None
    schedule_enabled: bool = True
    schedule_interval_hours: int = 6


class StationUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    official_url: Optional[str] = None
    schedule_enabled: Optional[bool] = None
    schedule_interval_hours: Optional[int] = None


class StationImportItem(BaseModel):
    name: str
    base_url: str
    api_key: str
    official_url: Optional[str] = None
    schedule_enabled: bool = True
    schedule_interval_hours: int = 6


def _normalize_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().rstrip("/")
    return normalized or None


def _read_api_key(station: RelayStation) -> str:
    stored = station.api_key_encrypted or ""
    try:
        plain = get_crypto().decrypt(stored)
    except Exception:
        return stored

    station.api_key_encrypted = plain
    return plain


def _mask_key(api_key: str) -> str:
    """脱敏显示：sk-***abc"""
    if len(api_key) <= 8:
        return "***"
    return api_key[:4] + "***" + api_key[-4:]


def _station_to_dict(s: RelayStation) -> dict:
    api_key = _read_api_key(s)
    return {
        "id": s.id,
        "name": s.name,
        "base_url": s.base_url,
        "official_url": s.official_url,
        "api_key": api_key,
        "api_key_masked": _mask_key(api_key),
        "schedule_enabled": bool(s.schedule_enabled),
        "schedule_interval_hours": s.schedule_interval_hours,
        "status": s.status,
        "last_probe_at": s.last_probe_at,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


@router.get("")
async def list_stations(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(RelayStation)
    if status:
        q = q.where(RelayStation.status == status)
    q = q.order_by(RelayStation.name)
    rows = (await db.execute(q)).scalars().all()
    stations = [_station_to_dict(r) for r in rows]
    if db.dirty:
        await db.commit()
    return {"stations": stations}


@router.post("")
async def create_station(
    body: StationCreate,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()

    s = RelayStation(
        name=body.name.strip(),
        base_url=body.base_url.strip().rstrip("/"),
        official_url=_normalize_url(body.official_url),
        api_key_encrypted=body.api_key.strip(),
        schedule_enabled=1 if body.schedule_enabled else 0,
        schedule_interval_hours=body.schedule_interval_hours,
        status="unknown",
        created_at=now,
        updated_at=now,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _station_to_dict(s)


@router.post("/import")
async def import_stations(
    body: list[StationImportItem],
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()
    added = []
    for item in body:
        s = RelayStation(
            name=item.name.strip(),
            base_url=item.base_url.strip().rstrip("/"),
            official_url=_normalize_url(item.official_url),
            api_key_encrypted=item.api_key.strip(),
            schedule_enabled=1 if item.schedule_enabled else 0,
            schedule_interval_hours=item.schedule_interval_hours,
            created_at=now,
            updated_at=now,
        )
        db.add(s)
        added.append(s)
    await db.commit()
    return {"imported": len(added)}


@router.get("/{station_id}")
async def get_station(
    station_id: int,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")
    station = _station_to_dict(s)
    if db.dirty:
        await db.commit()
    return station


@router.put("/{station_id}")
async def update_station(
    station_id: int,
    body: StationUpdate,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    if body.name is not None:
        s.name = body.name.strip()
    if body.base_url is not None:
        s.base_url = body.base_url.strip().rstrip("/")
    if body.official_url is not None:
        s.official_url = _normalize_url(body.official_url)
    if body.api_key is not None:
        s.api_key_encrypted = body.api_key.strip()
    if body.schedule_enabled is not None:
        s.schedule_enabled = 1 if body.schedule_enabled else 0
    if body.schedule_interval_hours is not None:
        s.schedule_interval_hours = body.schedule_interval_hours

    s.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    await db.refresh(s)
    return _station_to_dict(s)


@router.delete("/{station_id}")
async def delete_station(
    station_id: int,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")
    await db.delete(s)
    await db.commit()
    return {"ok": True}
