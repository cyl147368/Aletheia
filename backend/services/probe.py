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

    return {
        "total_models": total_models,
        "available_models": available_count,
        "unavailable_models": unavailable_count,
        "models_json": models_json,
        "model_results": results,
        "duration_ms": int((time.monotonic() - t0) * 1000),
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
    }

    requests = _build_probe_requests(base_url, api_key, model_id, settings)
    result["request_body"] = [
        {
            "provider": request.provider,
            "endpoint": request.endpoint,
            "url": request.url,
            "body": request.body,
        }
        for request in requests
    ]

    attempts = []
    for request in requests:
        attempts.append(await _send_probe_request(request, settings))

    successful_attempts = [a for a in attempts if a["available"]]
    result["available"] = bool(successful_attempts)
    result["response_body"] = attempts

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

    return result


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
