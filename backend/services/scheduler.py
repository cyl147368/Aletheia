import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import RelayStation, ProbeBatch, ModelResult
from services.probe import probe_station
from crypto import get_crypto
from config import Settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
_db_session_factory = None
_settings: Settings | None = None


def init_scheduler(db_session_factory, settings: Settings):
    global _db_session_factory, _settings
    _db_session_factory = db_session_factory
    _settings = settings

    scheduler.add_job(
        _run_scheduled_probes,
        "interval",
        minutes=5,  # 每 5 分钟检查一次
        id="scheduled_probe_check",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started (check every 5 min)")


async def _run_scheduled_probes():
    if _db_session_factory is None or _settings is None:
        return

    async with _db_session_factory() as db:
        rows = (
            await db.execute(
                select(RelayStation).where(RelayStation.schedule_enabled == 1)
            )
        ).scalars().all()

        now = datetime.now(timezone.utc)
        for s in rows:
            try:
                if s.last_probe_at:
                    last = datetime.fromisoformat(s.last_probe_at)
                    interval_hours = s.schedule_interval_hours or _settings.default_probe_interval_hours
                    if (now - last).total_seconds() < interval_hours * 3600:
                        continue  # 还没到下次探测时间

                await _probe_and_save(s, db)
            except Exception as e:
                logger.error(f"Scheduled probe failed for {s.name}: {e}")

        await db.commit()


async def _probe_and_save(s: RelayStation, db: AsyncSession):
    logger.info(f"Scheduled probe: {s.name}")
    api_key = get_crypto().decrypt(s.api_key_encrypted)

    result = await probe_station(s.base_url, api_key, _settings)

    now = datetime.now(timezone.utc).isoformat()

    if "error" in result:
        batch = ProbeBatch(
            station_id=s.id,
            probed_at=now,
            duration_ms=result["duration_ms"],
        )
        db.add(batch)
        s.status = "down"
        s.last_probe_at = now
        s.updated_at = now
        return

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

    if result["available_models"] == 0:
        s.status = "down"
    elif result["unavailable_models"] > 0:
        s.status = "degraded"
    else:
        s.status = "ok"
    s.last_probe_at = now
    s.updated_at = now
