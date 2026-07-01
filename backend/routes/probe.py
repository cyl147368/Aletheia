import logging
import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings
from database import get_db
from models import RelayStation, ProbeBatch, ModelResult
from routes.auth_middleware import require_auth
from services.deep_probe import deep_probe_station, normalize_detection_mode
from services.probe import list_model_catalog, probe_station

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["probe"], dependencies=[Depends(require_auth)])


class ProbeRequestBody(BaseModel):
    model_ids: list[str] | None = None
    mode: str | None = None


def _normalize_selected_model_ids(model_ids: list[str] | None) -> list[str] | None:
    if model_ids is None:
        return None
    seen = set()
    normalized = []
    for model_id in model_ids:
        clean = model_id.strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized


def _model_catalog_item(model) -> dict:
    return {
        "id": model.id,
        "pricing": model.pricing,
    }


def _station_summary(s: RelayStation) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "base_url": s.base_url,
        "official_url": s.official_url,
        "schedule_enabled": bool(s.schedule_enabled),
        "schedule_interval_hours": s.schedule_interval_hours,
        "status": s.status,
        "last_probe_at": s.last_probe_at,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _batch_summary(batch: ProbeBatch) -> dict:
    return {
        "id": batch.id,
        "probed_at": batch.probed_at,
        "total_models": batch.total_models,
        "available_models": batch.available_models,
        "unavailable_models": batch.unavailable_models,
        "duration_ms": batch.duration_ms,
        "batch_type": batch.batch_type,
    }


def _model_result_summary(model: ModelResult) -> dict:
    return {
        "id": model.id,
        "model_id": model.model_id,
        "available": bool(model.available),
        "ttft_ms": model.ttft_ms,
        "response_preview": None,
        "error_message": None,
        "request_body": None,
        "response_body": None,
        "authenticity_score": None,
        "degradation_flags": None,
    }


@router.post("/stations/{station_id}/probe")
async def trigger_probe(
    station_id: int,
    body: ProbeRequestBody | None = None,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(lambda: Settings()),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    selected_model_ids = _normalize_selected_model_ids(body.model_ids if body else None)
    if selected_model_ids is not None and len(selected_model_ids) == 0:
        raise HTTPException(status_code=400, detail="Select at least one model")

    mode = body.mode if body else None
    batch_type = "probe"
    if mode is not None:
        try:
            normalize_detection_mode(mode)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if selected_model_ids is None:
            raise HTTPException(status_code=400, detail="Select at least one model for deep detection")
        result = await deep_probe_station(s.base_url, s.api_key_encrypted, settings, selected_model_ids, mode)
        batch_type = "deep"
    else:
        result = await probe_station(s.base_url, s.api_key_encrypted, settings, selected_model_ids)
    if "error" in result and result["error"].startswith("Selected models not found"):
        raise HTTPException(status_code=400, detail=result["error"])

    return await _save_probe_result(s, result, db, batch_type=batch_type)


@router.get("/stations/{station_id}/models")
async def station_models(
    station_id: int,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(lambda: Settings()),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    t0 = time.monotonic()
    try:
        models, raw = await list_model_catalog(s.base_url, s.api_key_encrypted, settings)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to list models: {e}") from e

    return {
        "models": [_model_catalog_item(model) for model in models],
        "total_models": len(models),
        "models_json": raw,
        "duration_ms": int((time.monotonic() - t0) * 1000),
    }



async def _save_probe_result(s: RelayStation, result: dict, db: AsyncSession, batch_type: str = "probe") -> dict:
    if "error" in result:
        # 连 /v1/models 都失败了
        now = datetime.now(timezone.utc).isoformat()
        batch = ProbeBatch(
            station_id=s.id,
            probed_at=now,
            models_json=None,
            duration_ms=result["duration_ms"],
            batch_type=batch_type,
        )
        db.add(batch)
        if batch_type == "probe":
            s.status = "down"
            s.last_probe_at = now
            s.updated_at = now
        await db.commit()
        await db.refresh(batch)
        return {
            "batch_id": batch.id,
            "status": s.status,
            "error": result["error"],
            "batch_type": batch_type,
        }

    now = datetime.now(timezone.utc).isoformat()
    batch = ProbeBatch(
        station_id=s.id,
        probed_at=now,
        total_models=result["total_models"],
        available_models=result["available_models"],
        unavailable_models=result["unavailable_models"],
        models_json=result["models_json"],
        duration_ms=result["duration_ms"],
        batch_type=batch_type,
    )
    db.add(batch)
    await db.flush()

    for mr in result["model_results"]:
        db.add(ModelResult(
            batch_id=batch.id,
            model_id=mr["model_id"],
            available=1 if mr["available"] else 0,
            ttft_ms=mr["ttft_ms"],
            response_preview=mr.get("response_preview"),
            error_message=mr.get("error_message"),
            request_body=json.dumps(mr.get("request_body")) if mr.get("request_body") else None,
            response_body=json.dumps(mr.get("response_body")) if mr.get("response_body") else None,
            authenticity_score=mr.get("authenticity_score"),
            degradation_flags=json.dumps({
                "risks": mr.get("degradation_flags", []),
                "capabilities": mr.get("capability_flags", []),
            }),
        ))

    if batch_type == "probe":
        if result["available_models"] == 0:
            s.status = "down"
        elif result["unavailable_models"] > 0:
            s.status = "degraded"
        else:
            s.status = "ok"
        s.last_probe_at = now
        s.updated_at = now

    await db.commit()
    await db.refresh(batch)

    return {
        "batch_id": batch.id,
        "status": s.status,
        "total_models": batch.total_models,
        "available_models": batch.available_models,
        "unavailable_models": batch.unavailable_models,
        "duration_ms": batch.duration_ms,
        "batch_type": batch_type,
    }


@router.get("/stations/{station_id}/history")
async def station_history(
    station_id: int,
    page: int = 1,
    page_size: int = 20,
    batch_type: str = "probe",
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    q = (
        select(ProbeBatch)
        .where(ProbeBatch.station_id == station_id)
        .where(ProbeBatch.batch_type == batch_type)
        .order_by(ProbeBatch.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()

    return {
        "batches": [
            {
                "id": r.id,
                "probed_at": r.probed_at,
                "total_models": r.total_models,
                "available_models": r.available_models,
                "unavailable_models": r.unavailable_models,
                "duration_ms": r.duration_ms,
                "batch_type": r.batch_type,
            }
            for r in rows
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get("/stations/{station_id}/history/latest")
async def latest_result(
    station_id: int,
    summary: bool = False,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    q = (
        select(ProbeBatch)
        .where(ProbeBatch.station_id == station_id)
        .where(ProbeBatch.batch_type == "probe")
        .order_by(ProbeBatch.id.desc())
        .limit(1)
    )
    batch = (await db.execute(q)).scalars().first()
    if not batch:
        return {"batch": None, "models": []}

    if summary:
        models_q = (
            select(ModelResult.id, ModelResult.model_id, ModelResult.available, ModelResult.ttft_ms)
            .where(ModelResult.batch_id == batch.id)
            .order_by(ModelResult.model_id)
        )
        models = (await db.execute(models_q)).all()
    else:
        models_q = select(ModelResult).where(ModelResult.batch_id == batch.id).order_by(ModelResult.model_id)
        models = (await db.execute(models_q)).scalars().all()

    return {
        "batch": {
            "id": batch.id,
            "probed_at": batch.probed_at,
            "total_models": batch.total_models,
            "available_models": batch.available_models,
            "unavailable_models": batch.unavailable_models,
            "duration_ms": batch.duration_ms,
            "batch_type": batch.batch_type,
        },
        "models": [
            {
                "id": m.id,
                "model_id": m.model_id,
                "available": bool(m.available),
                "ttft_ms": m.ttft_ms,
                "response_preview": None if summary else m.response_preview,
                "error_message": None if summary else m.error_message,
                "request_body": None if summary else m.request_body,
                "response_body": None if summary else m.response_body,
                "authenticity_score": None if summary else m.authenticity_score,
                "degradation_flags": None if summary else m.degradation_flags,
            }
            for m in models
        ],
    }


@router.get("/stations/{station_id}/history/latest/deep")
async def latest_deep_result(
    station_id: int,
    summary: bool = False,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    q = (
        select(ProbeBatch)
        .where(ProbeBatch.station_id == station_id)
        .where(ProbeBatch.batch_type == "deep")
        .order_by(ProbeBatch.id.desc())
        .limit(1)
    )
    batch = (await db.execute(q)).scalars().first()
    if not batch:
        return {"batch": None, "models": []}

    if summary:
        models_q = (
            select(ModelResult.id, ModelResult.model_id, ModelResult.available, ModelResult.ttft_ms)
            .where(ModelResult.batch_id == batch.id)
            .order_by(ModelResult.model_id)
        )
        models = (await db.execute(models_q)).all()
    else:
        models_q = select(ModelResult).where(ModelResult.batch_id == batch.id).order_by(ModelResult.model_id)
        models = (await db.execute(models_q)).scalars().all()

    return {
        "batch": {
            "id": batch.id,
            "probed_at": batch.probed_at,
            "total_models": batch.total_models,
            "available_models": batch.available_models,
            "unavailable_models": batch.unavailable_models,
            "duration_ms": batch.duration_ms,
            "batch_type": batch.batch_type,
        },
        "models": [
            {
                "id": m.id,
                "model_id": m.model_id,
                "available": bool(m.available),
                "ttft_ms": m.ttft_ms,
                "response_preview": None if summary else m.response_preview,
                "error_message": None if summary else m.error_message,
                "request_body": None if summary else m.request_body,
                "response_body": None if summary else m.response_body,
                "authenticity_score": None if summary else m.authenticity_score,
                "degradation_flags": None if summary else m.degradation_flags,
            }
            for m in models
        ],
    }


@router.get("/stations/{station_id}/history/{batch_id}")
async def batch_detail(
    station_id: int,
    batch_id: int,
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(ProbeBatch, batch_id)
    if not batch or batch.station_id != station_id:
        raise HTTPException(status_code=404, detail="Batch not found")

    models_q = select(ModelResult).where(ModelResult.batch_id == batch_id).order_by(ModelResult.model_id)
    models = (await db.execute(models_q)).scalars().all()

    return {
        "batch": {
            "id": batch.id,
            "probed_at": batch.probed_at,
            "total_models": batch.total_models,
            "available_models": batch.available_models,
            "unavailable_models": batch.unavailable_models,
            "duration_ms": batch.duration_ms,
            "batch_type": batch.batch_type,
        },
        "models": [
            {
                "id": m.id,
                "model_id": m.model_id,
                "available": bool(m.available),
                "ttft_ms": m.ttft_ms,
                "response_preview": m.response_preview,
                "error_message": m.error_message,
                "request_body": m.request_body,
                "response_body": m.response_body,
                "authenticity_score": m.authenticity_score,
                "degradation_flags": m.degradation_flags,
            }
            for m in models
        ],
    }


@router.get("/route-overview")
async def route_overview(db: AsyncSession = Depends(get_db)):
    latest_batches = (
        select(
            ProbeBatch.station_id.label("station_id"),
            func.max(ProbeBatch.id).label("batch_id"),
        )
        .where(ProbeBatch.batch_type == "probe")
        .group_by(ProbeBatch.station_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(RelayStation, ProbeBatch, ModelResult)
            .outerjoin(latest_batches, latest_batches.c.station_id == RelayStation.id)
            .outerjoin(ProbeBatch, ProbeBatch.id == latest_batches.c.batch_id)
            .outerjoin(ModelResult, (ModelResult.batch_id == ProbeBatch.id) & (ModelResult.available == 1))
            .order_by(RelayStation.name, ModelResult.model_id)
        )
    ).all()

    stations_by_id: dict[int, dict] = {}
    results_by_station: dict[int, dict] = {}

    for station, batch, model in rows:
        if station.id not in stations_by_id:
            stations_by_id[station.id] = _station_summary(station)
            results_by_station[station.id] = {
                "station_id": station.id,
                "batch": _batch_summary(batch) if batch else None,
                "models": [],
            }

        if model:
            results_by_station[station.id]["models"].append(_model_result_summary(model))

    return {
        "stations": list(stations_by_id.values()),
        "results": list(results_by_station.values()),
    }


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    # 各状态计数
    status_q = (
        select(RelayStation.status, func.count(RelayStation.id))
        .group_by(RelayStation.status)
    )
    status_rows = (await db.execute(status_q)).all()
    counts = {row[0]: row[1] for row in status_rows}

    total = sum(counts.values())
    return {
        "total": total,
        "ok": counts.get("ok", 0),
        "degraded": counts.get("degraded", 0),
        "down": counts.get("down", 0),
        "unknown": counts.get("unknown", 0),
    }
