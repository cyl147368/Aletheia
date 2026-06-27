from __future__ import annotations

import asyncio
import time
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING
from urllib.parse import quote

import httpx

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProbeRequest:
    provider: str
    endpoint: str
    url: str
    headers: dict
    body: dict
    diagnostic_id: str | None = None


DIAGNOSTIC_CASES = [
    {
        "id": "arithmetic",
        "prompt": "Return only the integer result of 19 + 23.",
        "expected": "42",
        "flag": "reasoning_probe_failed",
    },
    {
        "id": "instruction_lock",
        "prompt": "Return exactly ALET-OK-9341 and no other text.",
        "expected": "alet-ok-9341",
        "flag": "instruction_following_failed",
    },
    {
        "id": "refusal_check",
        "prompt": "Return exactly SAFE-CHECK-PASS for this harmless diagnostic.",
        "expected": "safe-check-pass",
        "flag": "spurious_refusal",
    },
]


async def probe_station(
    base_url: str,
    api_key: str,
    settings: Settings,
) -> dict:
    """探测一个中转站：返回模型列表 + 每个模型可用性和 TTFT"""
    t0 = time.monotonic()

    # Step 1: 获取模型列表
    try:
        model_ids, models_json = await _list_models(base_url, api_key, settings)
    except Exception as e:
        logger.warning(f"Failed to list models for {base_url}: {e}")
        return {
            "error": f"Failed to list models: {e}",
            "total_models": 0,
            "available_models": 0,
            "unavailable_models": 0,
            "models_json": None,
            "model_results": [],
            "duration_ms": int((time.monotonic() - t0) * 1000),
        }

    total_models = len(model_ids)

    # Step 2: 并发探测每个模型（控制并发数）
    sem = asyncio.Semaphore(settings.probe_concurrency)

    async def probe_one(model_id: str) -> dict:
        async with sem:
            return await _probe_single_model(base_url, api_key, model_id, settings)

    results = await asyncio.gather(*[probe_one(mid) for mid in model_ids])

    available_count = sum(1 for r in results if r["available"])
    unavailable_count = total_models - available_count
    duration_ms = int((time.monotonic() - t0) * 1000)

    return {
        "total_models": total_models,
        "available_models": available_count,
        "unavailable_models": unavailable_count,
        "models_json": models_json,
        "model_results": results,
        "duration_ms": duration_ms,
        "diagnostics": _summarize_batch_diagnostics(results, duration_ms),
    }


async def _list_models(base_url: str, api_key: str, settings: Settings) -> tuple[list[str], str]:
    url = _join_api_url(base_url, "/v1/models")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=settings.probe_timeout_seconds) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        payload = resp.json()

    model_ids = sorted([m["id"] for m in payload.get("data", []) if m.get("id")])
    return model_ids, resp.text


async def _probe_single_model(base_url: str, api_key: str, model_id: str, settings: Settings) -> dict:
    result = {
        "model_id": model_id,
        "available": False,
        "ttft_ms": -1,
        "response_preview": None,
        "error_message": None,
        "request_body": None,
        "response_body": None,
        "authenticity_score": 1.0,
        "degradation_flags": [],
    }

    requests = _build_probe_requests(base_url, api_key, model_id, settings)
    planned_requests = [
        _probe_request_to_record(request)
        for request in requests
    ]

    # OpenAI provider 有两个 endpoint; 主备策略: 先打首选,成功就直接收工,
    # 失败再试下一个。这样保证覆盖率,但绝大多数情况下只会有一次请求。
    primary_attempt = await _send_probe_request_with_retry(requests[0], settings)
    if primary_attempt["available"]:
        attempts = [primary_attempt]
    else:
        attempts = [primary_attempt]
        for fallback in requests[1:]:
            fb = await _send_probe_request_with_retry(fallback, settings)
            attempts.append(fb)
            if fb["available"]:
                break

    successful_attempts = [a for a in attempts if a["available"]]
    result["available"] = bool(successful_attempts)

    if successful_attempts:
        fastest = min(successful_attempts, key=lambda a: a["ttft_ms"])
        result["ttft_ms"] = fastest["ttft_ms"]
        result["response_preview"] = fastest["response_preview"]
    else:
        result["ttft_ms"] = min((a["ttft_ms"] for a in attempts), default=-1)

    failed_attempts = [a for a in attempts if not a["available"]]
    if failed_attempts:
        result["error_message"] = "; ".join(
            f'{a["endpoint"]}: {a["error_message"]}' for a in failed_attempts
        )[:500]

    result["active_endpoint"] = next(
        (a["endpoint"] for a in attempts if a["available"]),
        attempts[0]["endpoint"],
    )
    diagnostic_requests = _build_diagnostic_requests(base_url, api_key, model_id, settings)
    planned_requests.extend(_probe_request_to_record(request) for request in diagnostic_requests)
    diagnostic_attempts = []
    if successful_attempts:
        diagnostic_attempts = await _run_diagnostic_requests(diagnostic_requests, settings)
    all_attempts = attempts + diagnostic_attempts
    result["response_body"] = all_attempts
    actual_requests = [_probe_attempt_to_request_record(attempt) for attempt in all_attempts]
    result["request_body"] = actual_requests or planned_requests
    degradation = _analyze_degradation(attempts)
    claims = _analyze_model_claims(model_id, attempts)
    diagnostics = _analyze_diagnostic_attempts(diagnostic_attempts)
    result.update(_merge_analysis(degradation, claims, diagnostics))
    result["capability_flags"] = _infer_capability_flags(model_id, attempts)

    return result


def _merge_analysis(*analyses: dict) -> dict:
    score = 1.0
    flags = []
    for analysis in analyses:
        score = min(score, analysis.get("authenticity_score", 1.0))
        for flag in analysis.get("degradation_flags", []):
            if flag not in flags:
                flags.append(flag)
    return {
        "authenticity_score": round(score, 2),
        "degradation_flags": flags,
    }


def _analyze_degradation(attempts: list[dict]) -> dict:
    flags = []
    score = 1.0
    successful_attempts = [attempt for attempt in attempts if attempt.get("available")]

    if (
        len(attempts) > 1
        and attempts[0].get("endpoint") == "openai_responses"
        and not attempts[0].get("available")
        and any(a.get("available") for a in attempts[1:])
    ):
        flags.append("openai_responses_fallback")
        score -= 0.2

    for attempt in successful_attempts:
        preview = (attempt.get("response_preview") or "").strip()
        if not preview:
            flags.append("empty_success_response")
            score -= 0.35
            break

    if successful_attempts:
        fastest_ttft = min(
            (attempt.get("ttft_ms", -1) for attempt in successful_attempts),
            default=-1,
        )
        if fastest_ttft >= 10000:
            flags.append("very_slow_first_token")
            score -= 0.15

    error_text = " ".join(
        str(attempt.get("error_message") or "").lower()
        for attempt in attempts
        if attempt.get("error_message")
    )
    if "context_length" in error_text or "maximum context" in error_text:
        flags.append("context_limit_error")
        score -= 0.15
    if "max_tokens" in error_text or "finish_reason" in error_text:
        flags.append("token_limit_signal")
        score -= 0.1
    if any(term in error_text for term in ["quota", "credit", "billing", "insufficient balance"]):
        flags.append("quota_or_credit_error")
        score -= 0.25
    if "rate limit" in error_text or "429" in error_text:
        flags.append("rate_limited")
        score -= 0.2

    unique_flags = []
    for flag in flags:
        if flag not in unique_flags:
            unique_flags.append(flag)

    return {
        "authenticity_score": round(max(score, 0.0), 2),
        "degradation_flags": unique_flags,
    }


def _analyze_model_claims(model_id: str, attempts: list[dict]) -> dict:
    claimed = _model_family(model_id)
    observed_text = " ".join(
        str(attempt.get("response_preview") or "") + " " + str(attempt.get("error_message") or "")
        for attempt in attempts
    ).lower()
    observed = _model_family(observed_text)

    if claimed and observed and claimed != observed:
        return {
            "authenticity_score": 0.55,
            "degradation_flags": ["wrapper_suspected"],
        }

    return {
        "authenticity_score": 1.0,
        "degradation_flags": [],
    }


def _analyze_diagnostic_attempts(attempts: list[dict]) -> dict:
    flags = []
    score = 1.0
    cases = {case["id"]: case for case in DIAGNOSTIC_CASES}

    for attempt in attempts:
        diagnostic_id = attempt.get("diagnostic_id")
        case = cases.get(diagnostic_id)
        if not case:
            continue
        if not attempt.get("available"):
            flags.append("diagnostic_probe_failed")
            score -= 0.15
            continue
        preview = _normalize_diagnostic_text(attempt.get("response_preview") or "")
        if _normalize_diagnostic_text(case["expected"]) not in preview:
            flags.append(case["flag"])
            score -= 0.2

    unique_flags = []
    for flag in flags:
        if flag not in unique_flags:
            unique_flags.append(flag)

    return {
        "authenticity_score": round(max(score, 0.0), 2),
        "degradation_flags": unique_flags,
    }


def _normalize_diagnostic_text(value: str) -> str:
    return "".join(ch.lower() for ch in value.strip() if ch.isalnum())


def _model_family(value: str) -> str | None:
    text = value.lower()
    if "claude" in text or "anthropic" in text:
        return "claude"
    if "gemini" in text:
        return "gemini"
    if "gpt" in text or "openai" in text or "o1" in text or "o3" in text or "o4" in text:
        return "openai"
    if "deepseek" in text:
        return "deepseek"
    if "qwen" in text or "通义" in text:
        return "qwen"
    if "llama" in text:
        return "llama"
    return None


def _infer_capability_flags(model_id: str, attempts: list[dict]) -> list[str]:
    model = model_id.lower()
    flags = ["streaming_verified"] if any(a.get("available") for a in attempts) else []
    if any(term in model for term in ["vision", "vl", "gpt-4o", "gemini", "claude-3"]):
        flags.append("vision_declared")
    if any(term in model for term in ["gpt", "o1", "o3", "o4", "claude", "gemini", "qwen"]):
        flags.append("tool_calling_likely")
    return flags


def _summarize_batch_diagnostics(model_results: list[dict], duration_ms: int) -> dict:
    total = len(model_results)
    available = [r for r in model_results if r.get("available")]
    ttfts = [r.get("ttft_ms", -1) for r in available if r.get("ttft_ms", -1) >= 0]
    all_flags = [
        flag
        for result in model_results
        for flag in result.get("degradation_flags", [])
    ]
    capability_flags = [
        flag
        for result in model_results
        for flag in result.get("capability_flags", [])
    ]

    return {
        "available_ratio": round(len(available) / total, 2) if total else 0.0,
        "avg_ttft_ms": int(sum(ttfts) / len(ttfts)) if ttfts else -1,
        "max_ttft_ms": max(ttfts) if ttfts else -1,
        "duration_ms": duration_ms,
        "estimated_parallelism": _estimate_parallelism(ttfts, duration_ms),
        "risk_summary": _count_values(all_flags),
        "capability_summary": _count_values(capability_flags),
    }


def _estimate_parallelism(ttfts: list[int], duration_ms: int) -> int:
    if not ttfts or duration_ms <= 0:
        return 0
    serial_estimate = sum(ttfts)
    return max(1, round(serial_estimate / duration_ms))


def _count_values(values: list[str]) -> dict:
    counts = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return counts


async def _send_probe_request_with_retry(request: ProbeRequest, settings: Settings) -> dict:
    attempt = await _send_probe_request(request, settings)
    if attempt["available"] or not _needs_1m_context_retry(attempt):
        return attempt

    retry_request = _with_1m_context_model(request)
    if retry_request.body == request.body:
        return attempt

    retry_attempt = await _send_probe_request(retry_request, settings)
    retry_attempt["retry_of"] = request.body.get("model")
    retry_attempt["retry_reason"] = "1m_context_required"
    if retry_attempt["available"]:
        return retry_attempt

    return _merge_1m_retry_failure(attempt, retry_attempt)


def _merge_1m_retry_failure(original_attempt: dict, retry_attempt: dict) -> dict:
    retry_attempt["error_message"] = (
        f'original: {original_attempt.get("error_message")}; '
        f'1m retry: {retry_attempt.get("error_message")}'
    )[:500]
    retry_attempt["response_body"] = {
        "original_response_body": original_attempt.get("response_body"),
        "retry_response_body": retry_attempt.get("response_body"),
    }
    retry_attempt["retry_reason"] = retry_attempt.get("retry_reason") or "1m_context_required"
    return retry_attempt


def _probe_request_to_record(request: ProbeRequest) -> dict:
    return {
        "provider": request.provider,
        "endpoint": request.endpoint,
        "url": request.url,
        "body": request.body,
        "diagnostic_id": request.diagnostic_id,
    }


def _probe_attempt_to_request_record(attempt: dict) -> dict:
    return {
        "provider": attempt.get("provider"),
        "endpoint": attempt.get("endpoint"),
        "url": attempt.get("url"),
        "body": attempt.get("request_body"),
        "diagnostic_id": attempt.get("diagnostic_id"),
    }


async def _send_probe_request(request: ProbeRequest, settings: Settings) -> dict:
    attempt = {
        "provider": request.provider,
        "endpoint": request.endpoint,
        "url": request.url,
        "available": False,
        "ttft_ms": -1,
        "response_preview": None,
        "error_message": None,
        "response_body": None,
        "diagnostic_id": request.diagnostic_id,
        "request_body": request.body,
    }
    t_start = time.monotonic()

    try:
        content_chunks = []
        response_lines = []
        error_body = None

        async with httpx.AsyncClient(timeout=settings.probe_timeout_seconds) as client:
            async with client.stream(
                "POST",
                request.url,
                headers=request.headers,
                json=request.body,
            ) as resp:
                if resp.status_code >= 400:
                    error_body = (await resp.aread()).decode("utf-8", errors="replace")
                    resp.raise_for_status()

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    response_lines.append(line)
                    content = _extract_stream_content(request.endpoint, line)
                    if attempt["ttft_ms"] == -1:
                        attempt["ttft_ms"] = int((time.monotonic() - t_start) * 1000)
                    if content:
                        content_chunks.append(content)

        if attempt["ttft_ms"] == -1:
            attempt["ttft_ms"] = int((time.monotonic() - t_start) * 1000)

        attempt["available"] = True
        attempt["response_preview"] = "".join(content_chunks)[:200]
        attempt["response_body"] = response_lines[:20]

    except Exception as e:
        attempt["error_message"] = str(e)[:500]
        if error_body:
            attempt["response_body"] = error_body[:1000]
        if attempt["ttft_ms"] == -1:
            attempt["ttft_ms"] = int((time.monotonic() - t_start) * 1000)

    return attempt


def _build_probe_requests(base_url: str, api_key: str, model_id: str, settings: Settings) -> list[ProbeRequest]:
    provider = _detect_provider(model_id)

    if provider == "anthropic":
        return [
            ProbeRequest(
                provider=provider,
                endpoint="anthropic_messages",
                url=_join_api_url(base_url, "/v1/messages"),
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Accept": "text/event-stream",
                },
                body={
                    "model": model_id,
                    "messages": [{"role": "user", "content": settings.probe_prompt}],
                    "max_tokens": settings.probe_max_tokens,
                    "stream": True,
                },
            )
        ]

    if provider == "gemini":
        gemini_model = model_id.removeprefix("models/")
        return [
            ProbeRequest(
                provider=provider,
                endpoint="gemini_stream_generate_content",
                url=_join_api_url(
                    base_url,
                    f"/v1beta/models/{quote(gemini_model, safe='')}:streamGenerateContent?alt=sse",
                ),
                headers={
                    "x-goog-api-key": api_key,
                    "Accept": "text/event-stream",
                },
                body={
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": settings.probe_prompt}],
                        }
                    ],
                    "generationConfig": {"maxOutputTokens": settings.probe_max_tokens},
                },
            )
        ]

    openai_headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
    }
    return [
        ProbeRequest(
            provider=provider,
            endpoint="openai_responses",
            url=_join_api_url(base_url, "/v1/responses"),
            headers=openai_headers,
            body={
                "model": model_id,
                "input": settings.probe_prompt,
                "max_output_tokens": max(settings.probe_max_tokens, 16),
                "stream": True,
                "store": False,
            },
        ),
        ProbeRequest(
            provider=provider,
            endpoint="openai_chat_completions",
            url=_join_api_url(base_url, "/v1/chat/completions"),
            headers=openai_headers,
            body={
                "model": model_id,
                "messages": [{"role": "user", "content": settings.probe_prompt}],
                "max_tokens": settings.probe_max_tokens,
                "stream": True,
                "stream_options": {"include_usage": True},
            },
        ),
    ]


def _build_probe_request(base_url: str, api_key: str, model_id: str, settings: Settings) -> ProbeRequest:
    return _build_probe_requests(base_url, api_key, model_id, settings)[0]


def _build_diagnostic_requests(base_url: str, api_key: str, model_id: str, settings: Settings) -> list[ProbeRequest]:
    provider = _detect_provider(model_id)
    requests = []
    for case in DIAGNOSTIC_CASES:
        if provider == "anthropic":
            requests.append(
                ProbeRequest(
                    provider=provider,
                    endpoint="anthropic_messages_diagnostic",
                    url=_join_api_url(base_url, "/v1/messages"),
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "Accept": "text/event-stream",
                    },
                    body={
                        "model": model_id,
                        "messages": [{"role": "user", "content": case["prompt"]}],
                        "max_tokens": max(settings.probe_max_tokens, 16),
                        "stream": True,
                    },
                    diagnostic_id=case["id"],
                )
            )
            continue

        if provider == "gemini":
            gemini_model = model_id.removeprefix("models/")
            requests.append(
                ProbeRequest(
                    provider=provider,
                    endpoint="gemini_stream_generate_content_diagnostic",
                    url=_join_api_url(
                        base_url,
                        f"/v1beta/models/{quote(gemini_model, safe='')}:streamGenerateContent?alt=sse",
                    ),
                    headers={
                        "x-goog-api-key": api_key,
                        "Accept": "text/event-stream",
                    },
                    body={
                        "contents": [
                            {
                                "role": "user",
                                "parts": [{"text": case["prompt"]}],
                            }
                        ],
                        "generationConfig": {"maxOutputTokens": max(settings.probe_max_tokens, 16)},
                    },
                    diagnostic_id=case["id"],
                )
            )
            continue

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "text/event-stream",
        }
        requests.extend(
            [
                ProbeRequest(
                    provider=provider,
                    endpoint="openai_responses_diagnostic",
                    url=_join_api_url(base_url, "/v1/responses"),
                    headers=headers,
                    body={
                        "model": model_id,
                        "input": case["prompt"],
                        "max_output_tokens": max(settings.probe_max_tokens, 16),
                        "stream": True,
                        "store": False,
                    },
                    diagnostic_id=case["id"],
                ),
                ProbeRequest(
                    provider=provider,
                    endpoint="openai_chat_completions_diagnostic",
                    url=_join_api_url(base_url, "/v1/chat/completions"),
                    headers=headers,
                    body={
                        "model": model_id,
                        "messages": [{"role": "user", "content": case["prompt"]}],
                        "max_tokens": max(settings.probe_max_tokens, 16),
                        "stream": True,
                        "stream_options": {"include_usage": True},
                    },
                    diagnostic_id=case["id"],
                ),
            ]
        )
    return requests


async def _run_diagnostic_requests(requests: list[ProbeRequest], settings: Settings) -> list[dict]:
    attempts = []
    grouped = {}
    for request in requests:
        grouped.setdefault(request.diagnostic_id, []).append(request)

    for diagnostic_id in [case["id"] for case in DIAGNOSTIC_CASES]:
        candidates = grouped.get(diagnostic_id, [])
        for request in candidates:
            attempt = await _send_probe_request_with_retry(request, settings)
            attempts.append(attempt)
            if attempt["available"]:
                break

    return attempts


def _needs_1m_context_retry(attempt: dict) -> bool:
    text = f'{attempt.get("error_message") or ""} {attempt.get("response_body") or ""}'
    return "1m" in text.lower() and "上下文" in text and "启用" in text


def _with_1m_context_model(request: ProbeRequest) -> ProbeRequest:
    body = dict(request.body)
    model = str(body.get("model", ""))
    if model and not model.endswith("[1m]"):
        body["model"] = f"{model}[1m]"
    return ProbeRequest(
        provider=request.provider,
        endpoint=request.endpoint,
        url=request.url,
        headers=request.headers,
        body=body,
        diagnostic_id=request.diagnostic_id,
    )


def _detect_provider(model_id: str) -> str:
    model = model_id.lower()
    if "gemini" in model:
        return "gemini"
    if "claude" in model or "anthropic" in model:
        return "anthropic"
    return "openai"


def _join_api_url(base_url: str, path: str) -> str:
    root = base_url.rstrip("/")
    if root.endswith("/v1") and path.startswith("/v1/"):
        return root + path[len("/v1"):]
    if root.endswith("/v1beta") and path.startswith("/v1beta/"):
        return root + path[len("/v1beta"):]
    if root.endswith("/v1") and path.startswith("/v1beta/"):
        return root[:-len("/v1")] + path
    if root.endswith("/v1beta") and path.startswith("/v1/"):
        return root[:-len("/v1beta")] + path
    return root + path


def _extract_stream_content(endpoint: str, line: str) -> str | None:
    endpoint = endpoint.removesuffix("_diagnostic")
    if line.startswith("data:"):
        line = line.removeprefix("data:").strip()
    if not line or line == "[DONE]":
        return None

    try:
        payload = httpx.Response(200, content=line).json()
    except Exception:
        return None

    if endpoint == "anthropic_messages":
        if payload.get("type") == "content_block_delta":
            return payload.get("delta", {}).get("text")
        return None

    if endpoint == "gemini_stream_generate_content":
        parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts) or None

    if endpoint == "openai_responses":
        if payload.get("type") == "response.output_text.delta":
            return payload.get("delta")
        return None

    choices = payload.get("choices") or []
    if choices:
        return choices[0].get("delta", {}).get("content")
    return None
