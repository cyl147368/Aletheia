from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)

VENDOR_DIR = Path(__file__).resolve().parents[1] / "vendor"
if str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))

from relay_detector.core.models import DetectionReport, Mode, mask_api_key  # noqa: E402
from relay_detector.core.scorer import compute_total, effective_verdict, summary_text  # noqa: E402
from relay_detector.protocols import anthropic, gemini, openai  # noqa: E402


PROTOCOL_MODULES = {
    "anthropic": anthropic,
    "openai": openai,
    "gemini": gemini,
}


def normalize_detection_mode(mode: str | None) -> Mode:
    if not mode:
        return Mode.STANDARD
    try:
        return Mode(mode.lower())
    except ValueError as exc:
        raise ValueError("mode must be quick, standard, or full") from exc


async def deep_probe_station(
    base_url: str,
    api_key: str,
    settings: Settings,
    selected_model_ids: list[str],
    mode: str,
) -> dict:
    started = time.monotonic()
    detector_mode = normalize_detection_mode(mode)
    model_ids = _dedupe_model_ids(selected_model_ids)
    if not model_ids:
        return {
            "error": "Select at least one model",
            "total_models": 0,
            "available_models": 0,
            "unavailable_models": 0,
            "models_json": None,
            "model_results": [],
            "duration_ms": 0,
        }

    results = []
    for model_id in model_ids:
        results.append(
            await _deep_probe_single_model(
                base_url,
                api_key,
                settings,
                model_id,
                detector_mode,
            )
        )

    available_count = sum(1 for result in results if result["available"])
    return {
        "total_models": len(model_ids),
        "available_models": available_count,
        "unavailable_models": len(model_ids) - available_count,
        "models_json": json.dumps(
            {
                "source": "veridrop",
                "mode": detector_mode.value,
                "models": model_ids,
            },
            ensure_ascii=False,
        ),
        "model_results": results,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


async def _deep_probe_single_model(
    base_url: str,
    api_key: str,
    settings: Settings,
    model_id: str,
    mode: Mode,
) -> dict:
    protocol = _detect_protocol(model_id)
    module = PROTOCOL_MODULES[protocol]
    timeout = float(settings.probe_timeout_seconds)
    config = module.build_config(
        mode,
        max_concurrent=min(max(int(settings.probe_concurrency), 1), 3),
    )
    config.request_timeout_s = timeout

    report: DetectionReport | None = None
    run_error = None
    client = module.make_client(base_url, api_key, timeout=timeout)
    try:
        async with client:
            runner = module.build_runner(client, module.build_detectors(mode), config)
            outcome = await runner.run(model_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Veridrop deep probe failed for %s: %s", model_id, exc)
        run_error = f"{type(exc).__name__}: {exc}"
        outcome = None

    if outcome is not None:
        score = compute_total(outcome.results)
        tier_title, tier_message = module.tier_banner()
        report = DetectionReport(
            protocol=module.PROTOCOL_NAME,
            tier=module.TIER,
            tier_title=tier_title,
            tier_message=tier_message,
            base_url=base_url,
            api_key_masked=mask_api_key(api_key),
            target_model=model_id,
            mode=mode,
            timestamp=datetime.now(timezone.utc),
            total_score=score,
            verdict=effective_verdict(score, outcome.results),
            results=outcome.results,
            performance=outcome.performance,
            summary=summary_text(score, outcome.results),
        )

    return _report_to_model_result(model_id, protocol, mode, report, run_error)


def _report_to_model_result(
    model_id: str,
    protocol: str,
    mode: Mode,
    report: DetectionReport | None,
    run_error: str | None,
) -> dict:
    if report is None:
        return {
            "model_id": model_id,
            "available": False,
            "ttft_ms": -1,
            "response_preview": None,
            "error_message": run_error or "deep detection failed",
            "request_body": {
                "source": "veridrop",
                "protocol": protocol,
                "mode": mode.value,
                "model": model_id,
            },
            "response_body": None,
            "authenticity_score": 0.0,
            "degradation_flags": ["deep_detection_error"],
            "capability_flags": [],
        }

    report_json = report.model_dump(mode="json")
    failed = [
        result.name
        for result in report.results
        if result.status in {"fail", "error"} and result.weight > 0
    ]
    skipped = [
        result.name
        for result in report.results
        if result.status == "skip" and result.weight > 0
    ]
    flags = [f"veridrop_{report.verdict}", *[f"detector_{name}" for name in failed[:8]]]
    capabilities = [
        f"protocol_{report.protocol.value}",
        f"mode_{report.mode.value}",
        f"tier_{report.tier.value}",
    ]
    if skipped:
        capabilities.append(f"skipped_{len(skipped)}")

    return {
        "model_id": model_id,
        "available": report.verdict != "failed",
        "ttft_ms": report.performance.ttft_ms if report.performance.ttft_ms is not None else -1,
        "response_preview": f"{report.summary} · score {report.total_score:.1f}",
        "error_message": report.run_error,
        "request_body": {
            "source": "veridrop",
            "protocol": report.protocol.value,
            "mode": report.mode.value,
            "model": model_id,
        },
        "response_body": report_json,
        "authenticity_score": round(report.total_score / 100, 4),
        "degradation_flags": flags,
        "capability_flags": capabilities,
    }


def _detect_protocol(model_id: str) -> str:
    normalized = model_id.lower()
    if "gemini" in normalized:
        return "gemini"
    if "claude" in normalized or "anthropic" in normalized:
        return "anthropic"
    return "openai"


def _dedupe_model_ids(model_ids: list[str]) -> list[str]:
    seen = set()
    normalized = []
    for model_id in model_ids:
        clean = model_id.strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized
