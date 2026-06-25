import asyncio
import time
import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI
from config import Settings

logger = logging.getLogger(__name__)


async def probe_station(
    base_url: str,
    api_key: str,
    settings: Settings,
) -> dict:
    """探测一个中转站：返回模型列表 + 每个模型可用性和 TTFT"""
    t0 = time.monotonic()

    client = AsyncOpenAI(
        base_url=base_url.rstrip("/") + "/v1",
        api_key=api_key,
        timeout=settings.probe_timeout_seconds,
    )

    # Step 1: 获取模型列表
    try:
        models_resp = await client.models.list()
        model_ids = sorted([m.id for m in models_resp.data])
        models_json = models_resp.model_dump_json()
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
            return await _probe_single_model(client, model_id, settings)

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


async def _probe_single_model(client: AsyncOpenAI, model_id: str, settings: Settings) -> dict:
    result = {
        "model_id": model_id,
        "available": False,
        "ttft_ms": -1,
        "response_preview": None,
        "error_message": None,
        "request_body": None,
        "response_body": None,
    }

    # 构造请求体
    request_body = {
        "model": model_id,
        "messages": [{"role": "user", "content": settings.probe_prompt}],
        "max_tokens": settings.probe_max_tokens,
        "stream": True,
    }
    result["request_body"] = request_body

    t_start = time.monotonic()
    try:
        stream = await client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": settings.probe_prompt}],
            max_tokens=settings.probe_max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )

        first_token = True
        content_chunks = []
        response_chunks = []

        async for chunk in stream:
            response_chunks.append(chunk.model_dump())
            if first_token:
                result["ttft_ms"] = int((time.monotonic() - t_start) * 1000)
                first_token = False
            if chunk.choices and chunk.choices[0].delta.content:
                content_chunks.append(chunk.choices[0].delta.content)

        result["available"] = True
        result["response_preview"] = "".join(content_chunks)[:200]
        result["response_body"] = response_chunks[:10]  # 只保留前10个chunk

    except Exception as e:
        result["error_message"] = str(e)[:500]
        if not result["ttft_ms"] or result["ttft_ms"] == -1:
            result["ttft_ms"] = int((time.monotonic() - t_start) * 1000)

    return result