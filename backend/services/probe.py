from __future__ import annotations

import asyncio
import json
import time
import logging
import random
from dataclasses import dataclass
from typing import TYPE_CHECKING
from urllib.parse import quote, urlencode

import httpx

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)

ANTHROPIC_1M_CONTEXT_BETA = "context-1m-2025-08-07"
ANTHROPIC_VERSION = "2023-06-01"
MODEL_LIST_PAGE_LIMIT = 200
MODEL_LIST_MAX_PAGES = 20
MODEL_LIST_MAX_MODELS = 2000
LITELLM_MODEL_PRICE_TABLE_URL = (
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
)
NEW_API_QUOTA_PER_USD = 500_000
PRICE_UNIT_TOKENS = 1_000_000
NEW_API_RATIO_BASE_USD_PER_1M_TOKENS = PRICE_UNIT_TOKENS / NEW_API_QUOTA_PER_USD
_official_price_estimate_cache: dict[str, dict] | None = None


@dataclass(frozen=True)
class ProbeRequest:
    provider: str
    endpoint: str
    url: str
    headers: dict
    body: dict
    diagnostic_id: str | None = None


@dataclass(frozen=True)
class ListedModel:
    id: str
    pricing: dict | None = None


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

PROBE_PROMPT_PREFIXES = (
    "Reply briefly:",
    "In one short phrase, answer:",
    "Give a concise answer:",
    "Use five words or fewer:",
    "Answer plainly:",
    "Respond with a short sentence:",
    "Give a tiny summary:",
    "Keep it brief:",
    "Say this naturally:",
    "Answer in a few words:",
)
PROBE_PROMPT_TASKS = (
    "what is a calm morning like",
    "name one benefit of clean logs",
    "describe a stable API",
    "what makes a dashboard useful",
    "name a common debugging step",
    "describe fresh rain",
    "what does latency mean",
    "name a useful CLI habit",
    "describe a quiet workspace",
    "what is a health check for",
    "name one safe rollout practice",
    "describe reliable routing",
    "what is a concise commit message",
    "name one reason to monitor errors",
    "describe a readable chart",
    "what is graceful fallback",
    "name one sign of good docs",
    "describe a clear API response",
    "what is token usage",
    "name a simple smoke test",
    "describe a helpful alert",
    "what makes retries useful",
    "name one deployment check",
    "describe a low-noise interface",
    "what is first-token latency",
    "name one reason to cache data",
    "describe a small refactor",
    "what is a model endpoint",
    "name one useful status label",
    "describe a passing test",
    "what is structured output",
    "name one way to reduce risk",
    "describe a clean error message",
    "what is a request timeout",
    "name one thing logs should include",
    "describe a healthy service",
    "what is API compatibility",
    "name one useful metric",
    "describe a quick probe",
    "what does availability mean",
)
PROBE_PROMPT_CONTEXTS = (
    "for a developer",
    "for an operator",
    "for a teammate",
    "for a release note",
    "for a status page",
    "for a tiny checklist",
    "for a notebook",
    "for a monitoring panel",
    "for a project README",
    "for a service owner",
    "for a support reply",
    "for an incident note",
    "for a config review",
    "for a test plan",
    "for a CLI user",
    "for a product engineer",
    "for a backend engineer",
    "for a frontend engineer",
    "for an API consumer",
    "for a system admin",
    "in simple English",
    "with no markdown",
    "as a plain sentence",
    "as a short label",
    "as a friendly note",
    "as a neutral phrase",
    "as a compact answer",
    "as a quick confirmation",
    "as a small observation",
    "as a calm response",
)

PROBE_PROMPT_POOL_SIZE = (
    len(PROBE_PROMPT_PREFIXES) * len(PROBE_PROMPT_TASKS) * len(PROBE_PROMPT_CONTEXTS)
)


async def probe_station(
    base_url: str,
    api_key: str,
    settings: Settings,
    selected_model_ids: list[str] | None = None,
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

    if selected_model_ids is not None:
        allowed = set(model_ids)
        selected = _dedupe_model_ids(selected_model_ids)
        unknown = [model_id for model_id in selected if model_id not in allowed]
        if unknown:
            return {
                "error": f"Selected models not found: {', '.join(unknown[:10])}",
                "total_models": 0,
                "available_models": 0,
                "unavailable_models": 0,
                "models_json": models_json,
                "model_results": [],
                "duration_ms": int((time.monotonic() - t0) * 1000),
            }
        model_ids = selected

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
    models, models_json = await list_model_catalog(base_url, api_key, settings)
    return [model.id for model in models], models_json


async def list_model_catalog(base_url: str, api_key: str, settings: Settings) -> tuple[list[ListedModel], str]:
    errors = []
    async with httpx.AsyncClient(timeout=settings.probe_timeout_seconds) as client:
        seen_urls = set()
        for path in ["/v1/models", "/models"]:
            url = _join_api_url(base_url, path)
            if url in seen_urls:
                continue
            seen_urls.add(url)
            try:
                models, raw = await _list_openai_compatible_models(client, url, api_key)
                return await _with_supplemental_pricing(client, base_url, api_key, models), raw
            except Exception as e:
                errors.append(f"{url}: {e}")

        try:
            models, raw = await _list_anthropic_models(client, base_url, api_key)
            return await _with_supplemental_pricing(client, base_url, api_key, models), raw
        except Exception as e:
            errors.append(f"anthropic /v1/models: {e}")

        try:
            models, raw = await _list_google_models(client, base_url, api_key)
            return await _with_supplemental_pricing(client, base_url, api_key, models), raw
        except Exception as e:
            errors.append(f"google /v1beta/models: {e}")

    detail = "; ".join(errors)[:1000]
    raise RuntimeError(f"No supported model-list endpoint succeeded. {detail}")


async def _list_openai_compatible_models(client: httpx.AsyncClient, url: str, api_key: str) -> tuple[list[ListedModel], str]:
    resp = await client.get(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    resp.raise_for_status()
    payload = resp.json()
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise ValueError("invalid OpenAI-compatible models payload")
    return _sort_listed_models(_extract_listed_models(data)), resp.text


async def _list_anthropic_models(client: httpx.AsyncClient, base_url: str, api_key: str) -> tuple[list[ListedModel], str]:
    models = []
    raw_pages = []
    after_id = ""
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Accept": "application/json",
    }

    for _ in range(MODEL_LIST_MAX_PAGES):
        query = {"limit": str(MODEL_LIST_PAGE_LIMIT)}
        if after_id:
            query["after_id"] = after_id
        url = _join_api_url(base_url, f"/v1/models?{urlencode(query)}")
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        raw_pages.append(resp.text)
        payload = resp.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise ValueError("invalid Anthropic models payload")
        models.extend(_extract_listed_models(data))

        has_more = payload.get("has_more") is True
        last_id = payload.get("last_id")
        if not has_more or not isinstance(last_id, str) or not last_id or last_id == after_id:
            break
        after_id = last_id
        if len(models) >= MODEL_LIST_MAX_MODELS:
            break

    models = _sort_listed_models(models)[:MODEL_LIST_MAX_MODELS]
    if not models:
        raise ValueError("Anthropic models payload contained no model ids")
    return models, _serialize_model_list_pages("anthropic", raw_pages)


async def _list_google_models(client: httpx.AsyncClient, base_url: str, api_key: str) -> tuple[list[ListedModel], str]:
    listed_models = []
    raw_pages = []
    page_token = ""
    headers = {
        "x-goog-api-key": api_key,
        "Accept": "application/json",
    }

    for _ in range(MODEL_LIST_MAX_PAGES):
        query = {"pageToken": page_token} if page_token else {}
        suffix = f"?{urlencode(query)}" if query else ""
        url = _join_api_url(base_url, f"/v1beta/models{suffix}")
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        raw_pages.append(resp.text)
        payload = resp.json()
        payload_models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(payload_models, list):
            raise ValueError("invalid Google models payload")

        for model in payload_models:
            if not isinstance(model, dict):
                continue
            name = model.get("name")
            if not isinstance(name, str):
                continue
            listed_models.append(ListedModel(id=name.removeprefix("models/"), pricing=_extract_model_pricing(model)))

        next_page_token = payload.get("nextPageToken")
        if not isinstance(next_page_token, str) or not next_page_token or next_page_token == page_token:
            break
        page_token = next_page_token
        if len(listed_models) >= MODEL_LIST_MAX_MODELS:
            break

    listed_models = _sort_listed_models(listed_models)[:MODEL_LIST_MAX_MODELS]
    if not listed_models:
        raise ValueError("Google models payload contained no model ids")
    return listed_models, _serialize_model_list_pages("google", raw_pages)


def _extract_model_ids(items: list) -> list[str]:
    return [model.id for model in _extract_listed_models(items)]


def _extract_listed_models(items: list) -> list[ListedModel]:
    models = []
    for item in items:
        if isinstance(item, str):
            model_id = item.strip()
            if model_id:
                models.append(ListedModel(id=model_id))
            continue
        if isinstance(item, dict):
            model_id = item.get("id")
            if isinstance(model_id, str) and model_id.strip():
                models.append(ListedModel(id=model_id.strip(), pricing=_extract_model_pricing(item)))
    return _dedupe_listed_models(models)


def _dedupe_listed_models(models: list[ListedModel]) -> list[ListedModel]:
    seen = set()
    normalized = []
    for model in models:
        clean = model.id.strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        normalized.append(ListedModel(id=clean, pricing=model.pricing))
    return normalized


def _sort_listed_models(models: list[ListedModel]) -> list[ListedModel]:
    return sorted(_dedupe_listed_models(models), key=lambda model: model.id)


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


def _extract_model_pricing(item: dict) -> dict | None:
    pricing = item.get("pricing")
    if isinstance(pricing, dict):
        normalized = _normalize_pricing_fields(pricing)
        if normalized:
            normalized.setdefault("source", "site")
            return normalized

    normalized = _normalize_pricing_fields(item)
    if normalized:
        normalized.setdefault("source", "site")
        return normalized

    return None


def _normalize_pricing_fields(source: dict) -> dict:
    fields = {
        "prompt": ["prompt", "input", "input_price", "prompt_price"],
        "completion": ["completion", "output", "output_price", "completion_price"],
        "request": ["request", "request_price"],
        "image": ["image", "image_price"],
        "web_search": ["web_search", "web_search_price"],
        "currency": ["currency", "currency_code"],
        "unit": ["unit", "price_unit"],
    }
    result = {}
    for output_key, candidates in fields.items():
        for candidate in candidates:
            value = source.get(candidate)
            if value is None:
                continue
            if output_key in {"currency", "unit"}:
                if isinstance(value, str) and value.strip():
                    result[output_key] = value.strip()
                    break
                continue
            parsed = _parse_price_value(value)
            if parsed is not None:
                result[output_key] = parsed
                break

    model_price = _parse_price_value(source.get("model_price"))
    completion_ratio = _parse_price_value(source.get("completion_ratio"))
    if model_price is not None:
        result.setdefault("prompt", model_price)
        if completion_ratio is not None:
            result.setdefault("completion", round(model_price * completion_ratio, 12))

    return result


def _parse_price_value(value) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        clean = value.strip()
        if not clean:
            return None
        try:
            return float(clean)
        except ValueError:
            return None
    return None


async def _with_supplemental_pricing(
    client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
    models: list[ListedModel],
) -> list[ListedModel]:
    site_pricing = await _safe_fetch_site_pricing(client, base_url, api_key)
    priced = _merge_model_pricing(models, site_pricing)
    if all(model.pricing for model in priced):
        return priced

    official_pricing = await _safe_fetch_official_price_estimates(client)
    return _merge_model_pricing(priced, official_pricing)


async def _safe_fetch_site_pricing(
    client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
) -> dict[str, dict]:
    try:
        return await _fetch_site_pricing(client, base_url, api_key)
    except Exception as e:
        logger.debug(f"Failed to fetch site pricing for {base_url}: {e}")
        return {}


async def _fetch_site_pricing(
    client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
) -> dict[str, dict]:
    resp = await client.get(
        _join_api_url(base_url, "/api/pricing"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    resp.raise_for_status()
    payload = resp.json()
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError("invalid pricing payload")

    group_ratio = payload.get("group_ratio") if isinstance(payload, dict) else None
    group_multiplier = _resolve_pricing_group_multiplier(group_ratio if isinstance(group_ratio, dict) else {})
    pricing_by_model = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        model_name = item.get("model_name") or item.get("name") or item.get("id")
        if not isinstance(model_name, str) or not model_name.strip():
            continue
        pricing = _normalize_site_pricing_item(item, group_multiplier)
        if pricing:
            pricing_by_model[model_name.strip()] = pricing
    return pricing_by_model


def _resolve_pricing_group_multiplier(group_ratio: dict) -> float:
    parsed = [
        ratio for ratio in (_parse_price_value(value) for value in group_ratio.values())
        if ratio is not None and ratio > 0
    ]
    if not parsed:
        return 1.0
    return parsed[0]


def _normalize_site_pricing_item(item: dict, group_multiplier: float) -> dict | None:
    direct = item.get("token_price_usd_per_million")
    if isinstance(direct, dict):
        prompt = _parse_price_value(direct.get("input"))
        completion = _parse_price_value(direct.get("output"))
        pricing = _build_token_pricing(prompt, completion, "site")
        if pricing:
            return pricing

    model_price = item.get("model_price")
    if isinstance(model_price, dict):
        prompt = _parse_price_value(model_price.get("input"))
        completion = _parse_price_value(model_price.get("output"))
        pricing = _build_token_pricing(prompt, completion, "site")
        if pricing:
            return pricing

    model_ratio = _parse_price_value(item.get("model_ratio"))
    completion_ratio = _parse_price_value(item.get("completion_ratio")) or 1.0
    if model_ratio is None:
        return None

    prompt = model_ratio * NEW_API_RATIO_BASE_USD_PER_1M_TOKENS * group_multiplier
    completion = prompt * completion_ratio
    return _build_token_pricing(prompt, completion, "site")


async def _safe_fetch_official_price_estimates(client: httpx.AsyncClient) -> dict[str, dict]:
    try:
        return await _fetch_official_price_estimates(client)
    except Exception as e:
        logger.debug(f"Failed to fetch official model price estimates: {e}")
        return {}


async def _fetch_official_price_estimates(client: httpx.AsyncClient) -> dict[str, dict]:
    global _official_price_estimate_cache
    if _official_price_estimate_cache is not None:
        return _official_price_estimate_cache

    resp = await client.get(
        LITELLM_MODEL_PRICE_TABLE_URL,
        headers={"Accept": "application/json"},
    )
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict):
        raise ValueError("invalid official price table payload")

    pricing_by_model = {}
    for model_id, item in payload.items():
        if model_id == "sample_spec" or not isinstance(item, dict):
            continue
        prompt = _usd_per_token_to_1m(item.get("input_cost_per_token"))
        completion = _usd_per_token_to_1m(item.get("output_cost_per_token"))
        pricing = _build_token_pricing(prompt, completion, "official_estimate")
        if pricing:
            pricing_by_model[model_id] = pricing
    _official_price_estimate_cache = pricing_by_model
    return pricing_by_model


def _usd_per_token_to_1m(value) -> float | None:
    parsed = _parse_price_value(value)
    if parsed is None:
        return None
    return parsed * PRICE_UNIT_TOKENS


def _build_token_pricing(prompt: float | None, completion: float | None, source: str) -> dict | None:
    if prompt is None and completion is None:
        return None
    pricing = {
        "currency": "USD",
        "unit": "1M tokens",
        "source": source,
    }
    if prompt is not None:
        pricing["prompt"] = prompt
    if completion is not None:
        pricing["completion"] = completion
    return pricing


def _merge_model_pricing(models: list[ListedModel], pricing_by_model: dict[str, dict]) -> list[ListedModel]:
    if not pricing_by_model:
        return models
    return [
        model if model.pricing else ListedModel(id=model.id, pricing=pricing_by_model.get(model.id))
        for model in models
    ]


def _serialize_model_list_pages(provider: str, raw_pages: list[str]) -> str:
    if len(raw_pages) == 1:
        return raw_pages[0]
    return json.dumps({"provider": provider, "responses": raw_pages}, ensure_ascii=False)


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

    probe_prompt = _pick_probe_prompt(settings)
    requests = _build_probe_requests(base_url, api_key, model_id, settings, probe_prompt)
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

    attempts = [attempt]
    for retry_request in _build_1m_context_retry_requests(request):
        retry_attempt = await _send_probe_request(retry_request, settings)
        retry_attempt["retry_of"] = request.body.get("model")
        retry_attempt["retry_reason"] = "1m_context_required"
        attempts.append(retry_attempt)
        if retry_attempt["available"]:
            return retry_attempt
        if not _needs_1m_context_retry(retry_attempt):
            break

    return _merge_1m_retry_failure(attempts)


def _merge_1m_retry_failure(attempts: list[dict]) -> dict:
    final_attempt = attempts[-1]
    final_attempt["error_message"] = "; ".join(
        f'{_retry_label(index)}: {attempt.get("error_message")}'
        for index, attempt in enumerate(attempts)
    )[:500]
    final_attempt["response_body"] = {
        _retry_response_key(index): attempt.get("response_body")
        for index, attempt in enumerate(attempts)
    }
    final_attempt["retry_reason"] = final_attempt.get("retry_reason") or "1m_context_required"
    return final_attempt


def _retry_label(index: int) -> str:
    return "original" if index == 0 else f"1m retry {index}"


def _retry_response_key(index: int) -> str:
    return "original_response_body" if index == 0 else f"retry_{index}_response_body"


def _probe_request_to_record(request: ProbeRequest) -> dict:
    return {
        "provider": request.provider,
        "endpoint": request.endpoint,
        "url": request.url,
        "headers": _safe_request_headers(request.headers),
        "body": request.body,
        "diagnostic_id": request.diagnostic_id,
    }


def _probe_attempt_to_request_record(attempt: dict) -> dict:
    return {
        "provider": attempt.get("provider"),
        "endpoint": attempt.get("endpoint"),
        "url": attempt.get("url"),
        "headers": attempt.get("request_headers"),
        "body": attempt.get("request_body"),
        "diagnostic_id": attempt.get("diagnostic_id"),
    }


def _safe_request_headers(headers: dict) -> dict:
    safe = {}
    for key, value in headers.items():
        normalized = key.lower()
        if normalized in {"authorization", "x-api-key", "x-goog-api-key"}:
            safe[key] = "***"
        else:
            safe[key] = value
    return safe


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
        "request_headers": _safe_request_headers(request.headers),
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


def _pick_probe_prompt(settings: Settings) -> str:
    configured = getattr(settings, "probe_prompt", "hi")
    if configured and configured.strip().lower() != "hi":
        return configured.strip()

    index = random.randrange(PROBE_PROMPT_POOL_SIZE)
    context_count = len(PROBE_PROMPT_CONTEXTS)
    task_count = len(PROBE_PROMPT_TASKS)
    prefix = PROBE_PROMPT_PREFIXES[index // (task_count * context_count)]
    remainder = index % (task_count * context_count)
    task = PROBE_PROMPT_TASKS[remainder // context_count]
    context = PROBE_PROMPT_CONTEXTS[remainder % context_count]
    return f"{prefix} {task} {context}."


def _build_probe_requests(
    base_url: str,
    api_key: str,
    model_id: str,
    settings: Settings,
    probe_prompt: str | None = None,
) -> list[ProbeRequest]:
    provider = _detect_provider(model_id)
    prompt = probe_prompt or _pick_probe_prompt(settings)

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
                    "messages": [{"role": "user", "content": prompt}],
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
                            "parts": [{"text": prompt}],
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
                "input": prompt,
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
                "messages": [{"role": "user", "content": prompt}],
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


def _with_1m_context_header(request: ProbeRequest) -> ProbeRequest:
    headers = dict(request.headers)
    existing = str(headers.get("anthropic-beta", "")).strip()
    betas = [beta.strip() for beta in existing.split(",") if beta.strip()]
    if ANTHROPIC_1M_CONTEXT_BETA not in betas:
        betas.append(ANTHROPIC_1M_CONTEXT_BETA)
    headers["anthropic-beta"] = ",".join(betas)
    return ProbeRequest(
        provider=request.provider,
        endpoint=request.endpoint,
        url=request.url,
        headers=headers,
        body=request.body,
        diagnostic_id=request.diagnostic_id,
    )


def _build_1m_context_retry_requests(request: ProbeRequest) -> list[ProbeRequest]:
    with_header = _with_1m_context_header(request)
    requests = [with_header]
    with_header_and_model = _with_1m_context_model(with_header)
    if with_header_and_model.body != with_header.body:
        requests.append(with_header_and_model)
    return requests


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
