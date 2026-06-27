import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings
from database import get_db
from models import RelayStation, ProbeBatch, ModelResult
from routes.auth_middleware import require_auth
from services.probe import probe_station

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["probe"], dependencies=[Depends(require_auth)])


@router.post("/stations/{station_id}/probe")
async def trigger_probe(
    station_id: int,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(lambda: Settings()),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    result = await probe_station(s.base_url, s.api_key_encrypted, settings)

    if "error" in result:
        # 连 /v1/models 都失败了
        now = datetime.now(timezone.utc).isoformat()
        batch = ProbeBatch(
            station_id=s.id,
            probed_at=now,
            models_json=None,
            duration_ms=result["duration_ms"],
        )
        db.add(batch)
        s.status = "down"
        s.last_probe_at = now
        s.updated_at = now
        await db.commit()
        await db.refresh(batch)
        return {
            "batch_id": batch.id,
            "status": "down",
            "error": result["error"],
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
    )
    db.add(batch)
    await db.flush()

    for mr in result["model_results"]:
        import json
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

    # 更新站点状态
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
    }


@router.get("/stations/{station_id}/history")
async def station_history(
    station_id: int,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    q = (
        select(ProbeBatch)
        .where(ProbeBatch.station_id == station_id)
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
            }
            for r in rows
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get("/stations/{station_id}/history/latest")
async def latest_result(
    station_id: int,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(RelayStation, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")

    q = (
        select(ProbeBatch)
        .where(ProbeBatch.station_id == station_id)
        .order_by(ProbeBatch.id.desc())
        .limit(1)
    )
    batch = (await db.execute(q)).scalars().first()
    if not batch:
        return {"batch": None, "models": []}

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


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func

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
