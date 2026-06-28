import unittest
import sys
import types
from types import SimpleNamespace

if "httpx" not in sys.modules:
    httpx_stub = types.ModuleType("httpx")

    class _StubResponse:
        def __init__(self, status_code, content):
            self.status_code = status_code
            self.content = content

        def json(self):
            import json
            return json.loads(self.content)

    httpx_stub.Response = _StubResponse
    sys.modules["httpx"] = httpx_stub

import services.probe as probe_module
from services.probe import (
    ANTHROPIC_1M_CONTEXT_BETA,
    DIAGNOSTIC_CASES,
    _analyze_diagnostic_attempts,
    _analyze_degradation,
    _analyze_model_claims,
    _build_1m_context_retry_requests,
    _build_diagnostic_requests,
    _build_probe_request,
    _build_probe_requests,
    _list_models,
    list_model_catalog,
    _merge_1m_retry_failure,
    _probe_attempt_to_request_record,
    _probe_request_to_record,
    _with_1m_context_model,
    _summarize_batch_diagnostics,
)


def probe_settings():
    return SimpleNamespace(probe_prompt="hi", probe_max_tokens=5, probe_timeout_seconds=30)


class FakeModelListResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    @property
    def text(self):
        import json
        return json.dumps(self._payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"{self.status_code} error")


class FakeModelListAsyncClient:
    responses = {}
    requests = []

    def __init__(self, timeout):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, headers):
        self.__class__.requests.append({"url": url, "headers": headers})
        response = self.__class__.responses.get(url)
        if isinstance(response, Exception):
            raise response
        if response is None:
            return FakeModelListResponse({"error": "missing fake"}, status_code=404)
        return response


class ModelListTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.original_async_client = getattr(probe_module.httpx, "AsyncClient", None)
        FakeModelListAsyncClient.responses = {}
        FakeModelListAsyncClient.requests = []
        probe_module._official_price_estimate_cache = None
        probe_module.httpx.AsyncClient = FakeModelListAsyncClient

    def tearDown(self):
        if self.original_async_client is None:
            delattr(probe_module.httpx, "AsyncClient")
        else:
            probe_module.httpx.AsyncClient = self.original_async_client

    async def test_lists_openai_compatible_models_first(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {
                    "object": "list",
                    "data": [
                        {"id": "gpt-4o-mini", "pricing": {"prompt": "0.15", "completion": "0.6"}},
                        {"id": "claude-3-5-sonnet"},
                        {"id": "gpt-4o-mini"},
                    ],
                }
            )
        }

        model_ids, raw = await _list_models("https://relay.example.com", "sk-test", probe_settings())

        self.assertEqual(model_ids, ["claude-3-5-sonnet", "gpt-4o-mini"])
        self.assertIn("gpt-4o-mini", raw)
        self.assertEqual(
            FakeModelListAsyncClient.requests[0]["url"],
            "https://relay.example.com/v1/models",
        )
        self.assertFalse(any(request["url"] == "https://relay.example.com/models" for request in FakeModelListAsyncClient.requests))
        self.assertEqual(
            FakeModelListAsyncClient.requests[0]["headers"]["Authorization"],
            "Bearer sk-test",
        )

    async def test_model_catalog_keeps_pricing_metadata(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {
                    "data": [
                        {
                            "id": "openrouter/auto",
                            "pricing": {
                                "prompt": "0.00000015",
                                "completion": "0.0000006",
                                "request": "0",
                            },
                        },
                    ],
                }
            )
        }

        models, _raw = await list_model_catalog("https://relay.example.com", "sk-test", probe_settings())

        self.assertEqual(models[0].id, "openrouter/auto")
        self.assertEqual(models[0].pricing["prompt"], 0.00000015)
        self.assertEqual(models[0].pricing["completion"], 0.0000006)
        self.assertEqual(models[0].pricing["source"], "site")

    async def test_model_catalog_uses_site_pricing_endpoint(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {"data": [{"id": "gpt-4o-mini"}, {"id": "gpt-4o"}]}
            ),
            "https://relay.example.com/api/pricing": FakeModelListResponse(
                {
                    "success": True,
                    "data": [
                        {
                            "model_name": "gpt-4o-mini",
                            "quota_type": 0,
                            "model_ratio": 0.075,
                            "completion_ratio": 4,
                        },
                    ],
                    "group_ratio": {"default": 1},
                    "usable_group": {"default": "default"},
                }
            ),
        }

        models, _raw = await list_model_catalog("https://relay.example.com", "sk-test", probe_settings())
        pricing_by_id = {model.id: model.pricing for model in models}

        self.assertEqual(pricing_by_id["gpt-4o-mini"]["source"], "site")
        self.assertEqual(pricing_by_id["gpt-4o-mini"]["prompt"], 0.15)
        self.assertEqual(pricing_by_id["gpt-4o-mini"]["completion"], 0.6)
        self.assertIsNone(pricing_by_id["gpt-4o"])

    async def test_model_catalog_falls_back_to_official_price_estimate(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {"data": [{"id": "gpt-4o-mini"}]}
            ),
            "https://relay.example.com/api/pricing": FakeModelListResponse({}, status_code=404),
            probe_module.LITELLM_MODEL_PRICE_TABLE_URL: FakeModelListResponse(
                {
                    "gpt-4o-mini": {
                        "input_cost_per_token": 0.00000015,
                        "output_cost_per_token": 0.0000006,
                    },
                }
            ),
        }

        models, _raw = await list_model_catalog("https://relay.example.com", "sk-test", probe_settings())

        self.assertEqual(models[0].pricing["source"], "official_estimate")
        self.assertEqual(models[0].pricing["prompt"], 0.15)
        self.assertEqual(models[0].pricing["completion"], 0.6)
        self.assertEqual(models[0].pricing["unit"], "1M tokens")

    async def test_falls_back_to_anthropic_paginated_models(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse({}, status_code=404),
            "https://relay.example.com/models": FakeModelListResponse({}, status_code=404),
            "https://relay.example.com/v1/models?limit=200": FakeModelListResponse(
                {
                    "data": [{"id": "claude-3-5-sonnet"}, {"id": "claude-3-opus"}],
                    "has_more": True,
                    "last_id": "claude-3-opus",
                }
            ),
            "https://relay.example.com/v1/models?limit=200&after_id=claude-3-opus": FakeModelListResponse(
                {
                    "data": [{"id": "claude-3-haiku"}],
                    "has_more": False,
                    "last_id": "claude-3-haiku",
                }
            ),
        }

        model_ids, raw = await _list_models("https://relay.example.com", "sk-test", probe_settings())

        self.assertEqual(model_ids, ["claude-3-5-sonnet", "claude-3-haiku", "claude-3-opus"])
        self.assertIn("anthropic", raw)
        anthropic_requests = [
            request for request in FakeModelListAsyncClient.requests
            if "after_id" in request["url"] or request["url"].endswith("limit=200")
        ]
        self.assertEqual(len(anthropic_requests), 2)
        self.assertEqual(anthropic_requests[0]["headers"]["x-api-key"], "sk-test")
        self.assertEqual(anthropic_requests[0]["headers"]["anthropic-version"], "2023-06-01")

    async def test_falls_back_to_google_paginated_models(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse({}, status_code=404),
            "https://relay.example.com/models": FakeModelListResponse({}, status_code=404),
            "https://relay.example.com/v1/models?limit=200": FakeModelListResponse({}, status_code=404),
            "https://relay.example.com/v1beta/models": FakeModelListResponse(
                {
                    "models": [{"name": "models/gemini-1.5-pro"}],
                    "nextPageToken": "next",
                }
            ),
            "https://relay.example.com/v1beta/models?pageToken=next": FakeModelListResponse(
                {
                    "models": [{"name": "models/gemini-2.0-flash"}, {"name": "gemini-2.0-flash"}],
                }
            ),
        }

        model_ids, raw = await _list_models("https://relay.example.com", "sk-test", probe_settings())

        self.assertEqual(model_ids, ["gemini-1.5-pro", "gemini-2.0-flash"])
        self.assertIn("google", raw)
        google_requests = [
            request for request in FakeModelListAsyncClient.requests
            if "/v1beta/models" in request["url"]
        ]
        self.assertEqual(len(google_requests), 2)
        self.assertEqual(google_requests[0]["headers"]["x-goog-api-key"], "sk-test")

    async def test_probe_station_only_probes_selected_models(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {
                    "data": [
                        {"id": "gpt-4o-mini"},
                        {"id": "claude-3-haiku"},
                    ],
                }
            )
        }
        original_probe_single = probe_module._probe_single_model
        probed = []

        async def fake_probe_single(_base_url, _api_key, model_id, _settings):
            probed.append(model_id)
            return {
                "model_id": model_id,
                "available": True,
                "ttft_ms": 10,
                "response_preview": "ok",
                "degradation_flags": [],
                "capability_flags": [],
            }

        probe_module._probe_single_model = fake_probe_single
        try:
            result = await probe_module.probe_station(
                "https://relay.example.com",
                "sk-test",
                SimpleNamespace(probe_timeout_seconds=30, probe_concurrency=2),
                ["claude-3-haiku"],
            )
        finally:
            probe_module._probe_single_model = original_probe_single

        self.assertEqual(probed, ["claude-3-haiku"])
        self.assertEqual(result["total_models"], 1)
        self.assertEqual(result["available_models"], 1)

    async def test_probe_station_rejects_unknown_selected_models(self):
        FakeModelListAsyncClient.responses = {
            "https://relay.example.com/v1/models": FakeModelListResponse(
                {"data": [{"id": "gpt-4o-mini"}]}
            )
        }

        result = await probe_module.probe_station(
            "https://relay.example.com",
            "sk-test",
            SimpleNamespace(probe_timeout_seconds=30, probe_concurrency=2),
            ["missing-model"],
        )

        self.assertIn("Selected models not found", result["error"])


class ProbeRequestTest(unittest.TestCase):
    def test_openai_model_uses_responses_and_chat_completions_urls(self):
        requests = _build_probe_requests(
            "https://relay.example.com",
            "sk-test",
            "gpt-4o-mini",
            probe_settings(),
        )

        self.assertEqual([r.endpoint for r in requests], ["openai_responses", "openai_chat_completions"])
        self.assertEqual(requests[0].provider, "openai")
        self.assertEqual(requests[0].url, "https://relay.example.com/v1/responses")
        self.assertEqual(requests[0].headers["Authorization"], "Bearer sk-test")
        self.assertEqual(requests[0].body["model"], "gpt-4o-mini")
        self.assertEqual(requests[0].body["input"], "hi")
        self.assertEqual(requests[0].body["max_output_tokens"], 16)
        self.assertEqual(requests[1].url, "https://relay.example.com/v1/chat/completions")
        self.assertEqual(requests[1].body["messages"][0]["content"], "hi")

    def test_claude_model_uses_anthropic_messages_url(self):
        req = _build_probe_request(
            "https://relay.example.com/v1",
            "sk-test",
            "claude-3-5-sonnet-20241022",
            probe_settings(),
        )

        self.assertEqual(req.provider, "anthropic")
        self.assertEqual(req.endpoint, "anthropic_messages")
        self.assertEqual(req.url, "https://relay.example.com/v1/messages")
        self.assertEqual(req.headers["x-api-key"], "sk-test")
        self.assertEqual(req.body["model"], "claude-3-5-sonnet-20241022")

    def test_gemini_model_uses_stream_generate_content_url(self):
        req = _build_probe_request(
            "https://relay.example.com/v1",
            "sk-test",
            "gemini-1.5-pro",
            probe_settings(),
        )

        self.assertEqual(req.provider, "gemini")
        self.assertEqual(req.endpoint, "gemini_stream_generate_content")
        self.assertEqual(
            req.url,
            "https://relay.example.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse",
        )
        self.assertEqual(req.headers["x-goog-api-key"], "sk-test")
        self.assertEqual(req.body["contents"][0]["parts"][0]["text"], "hi")

    def test_builds_provider_specific_diagnostic_requests(self):
        openai = _build_diagnostic_requests(
            "https://relay.example.com",
            "sk-test",
            "gpt-4o-mini",
            probe_settings(),
        )
        claude = _build_diagnostic_requests(
            "https://relay.example.com/v1",
            "sk-test",
            "claude-3-5-sonnet-20241022",
            probe_settings(),
        )
        gemini = _build_diagnostic_requests(
            "https://relay.example.com/v1",
            "sk-test",
            "gemini-1.5-pro",
            probe_settings(),
        )

        self.assertEqual(len(openai), len(DIAGNOSTIC_CASES) * 2)
        self.assertEqual(openai[0].endpoint, "openai_responses_diagnostic")
        self.assertIn("Return only", openai[0].body["input"])
        self.assertEqual(claude[0].endpoint, "anthropic_messages_diagnostic")
        self.assertIn("Return only", claude[0].body["messages"][0]["content"])
        self.assertEqual(gemini[0].endpoint, "gemini_stream_generate_content_diagnostic")
        self.assertIn("Return only", gemini[0].body["contents"][0]["parts"][0]["text"])

    def test_rebuilds_request_with_1m_context_suffix(self):
        requests = _build_probe_requests(
            "https://relay.example.com/v1",
            "sk-test",
            "claude-3-7-sonnet-20250219",
            probe_settings(),
        )

        retried = _with_1m_context_model(requests[0])

        self.assertEqual(retried.body["model"], "claude-3-7-sonnet-20250219[1m]")
        self.assertEqual(retried.endpoint, requests[0].endpoint)
        self.assertEqual(retried.url, requests[0].url)

    def test_builds_1m_retry_requests_with_header_before_model_alias(self):
        requests = _build_probe_requests(
            "https://relay.example.com/v1",
            "sk-test",
            "claude-3-7-sonnet-20250219",
            probe_settings(),
        )

        retries = _build_1m_context_retry_requests(requests[0])

        self.assertEqual(len(retries), 2)
        self.assertEqual(retries[0].body["model"], "claude-3-7-sonnet-20250219")
        self.assertEqual(retries[0].headers["anthropic-beta"], ANTHROPIC_1M_CONTEXT_BETA)
        self.assertEqual(retries[1].body["model"], "claude-3-7-sonnet-20250219[1m]")
        self.assertEqual(retries[1].headers["anthropic-beta"], ANTHROPIC_1M_CONTEXT_BETA)

    def test_request_record_keeps_safe_headers_visible(self):
        request = _build_probe_request(
            "https://relay.example.com/v1",
            "sk-test",
            "claude-3-7-sonnet-20250219",
            probe_settings(),
        )
        retried = _build_1m_context_retry_requests(request)[0]

        record = _probe_request_to_record(retried)

        self.assertEqual(record["headers"]["x-api-key"], "***")
        self.assertEqual(record["headers"]["anthropic-beta"], ANTHROPIC_1M_CONTEXT_BETA)

    def test_attempt_request_record_prefers_actual_retry_body(self):
        record = _probe_attempt_to_request_record(
            {
                "provider": "anthropic",
                "endpoint": "anthropic_messages",
                "url": "https://relay.example.com/v1/messages",
                "request_headers": {
                    "x-api-key": "***",
                    "anthropic-beta": ANTHROPIC_1M_CONTEXT_BETA,
                },
                "request_body": {
                    "model": "claude-3-7-sonnet-20250219[1m]",
                    "messages": [{"role": "user", "content": "hi"}],
                },
            }
        )

        self.assertEqual(record["body"]["model"], "claude-3-7-sonnet-20250219[1m]")
        self.assertEqual(record["headers"]["anthropic-beta"], ANTHROPIC_1M_CONTEXT_BETA)

    def test_failed_1m_retry_keeps_retry_request_body_visible(self):
        original = {
            "provider": "anthropic",
            "endpoint": "anthropic_messages",
            "url": "https://relay.example.com/v1/messages",
            "available": False,
            "error_message": "1m 上下文已经全量可用，请启用 1m 上下文后重试",
            "request_body": {"model": "claude-3-7-sonnet-20250219"},
        }
        retry_with_header = {
            "provider": "anthropic",
            "endpoint": "anthropic_messages",
            "url": "https://relay.example.com/v1/messages",
            "available": False,
            "error_message": "1m 上下文已经全量可用，请启用 1m 上下文后重试",
            "request_headers": {"anthropic-beta": ANTHROPIC_1M_CONTEXT_BETA},
            "request_body": {"model": "claude-3-7-sonnet-20250219"},
        }
        retry_with_alias = {
            "provider": "anthropic",
            "endpoint": "anthropic_messages",
            "url": "https://relay.example.com/v1/messages",
            "available": False,
            "error_message": "still unavailable",
            "request_headers": {"anthropic-beta": ANTHROPIC_1M_CONTEXT_BETA},
            "request_body": {"model": "claude-3-7-sonnet-20250219[1m]"},
        }

        merged = _merge_1m_retry_failure([original, retry_with_header, retry_with_alias])

        self.assertEqual(merged["request_body"]["model"], "claude-3-7-sonnet-20250219[1m]")
        self.assertEqual(merged["request_headers"]["anthropic-beta"], ANTHROPIC_1M_CONTEXT_BETA)
        self.assertIn("original:", merged["error_message"])
        self.assertIn("1m retry 1:", merged["error_message"])
        self.assertIn("1m retry 2:", merged["error_message"])

    def test_diagnostic_analysis_scores_cross_provider_failures(self):
        attempts = [
            {
                "endpoint": "anthropic_messages_diagnostic",
                "diagnostic_id": "arithmetic",
                "available": True,
                "ttft_ms": 90,
                "response_preview": "43",
                "error_message": None,
            },
            {
                "endpoint": "gemini_stream_generate_content_diagnostic",
                "diagnostic_id": "instruction_lock",
                "available": True,
                "ttft_ms": 100,
                "response_preview": "hello sentinel-9341",
                "error_message": None,
            },
            {
                "endpoint": "openai_chat_completions_diagnostic",
                "diagnostic_id": "refusal_check",
                "available": True,
                "ttft_ms": 100,
                "response_preview": "As an AI model, I cannot answer.",
                "error_message": None,
            },
        ]

        analysis = _analyze_diagnostic_attempts(attempts)

        self.assertEqual(analysis["authenticity_score"], 0.4)
        self.assertEqual(
            analysis["degradation_flags"],
            ["reasoning_probe_failed", "instruction_following_failed", "spurious_refusal"],
        )

    def test_degradation_analysis_flags_empty_successful_response(self):
        analysis = _analyze_degradation(
            [
                {
                    "endpoint": "openai_responses",
                    "available": True,
                    "ttft_ms": 120,
                    "response_preview": "",
                    "error_message": None,
                }
            ]
        )

        self.assertEqual(analysis["authenticity_score"], 0.65)
        self.assertEqual(analysis["degradation_flags"], ["empty_success_response"])

    def test_degradation_analysis_flags_openai_fallback(self):
        analysis = _analyze_degradation(
            [
                {
                    "endpoint": "openai_responses",
                    "available": False,
                    "ttft_ms": 80,
                    "response_preview": None,
                    "error_message": "404 Not Found",
                },
                {
                    "endpoint": "openai_chat_completions",
                    "available": True,
                    "ttft_ms": 140,
                    "response_preview": "hi",
                    "error_message": None,
                },
            ]
        )

        self.assertEqual(analysis["authenticity_score"], 0.8)
        self.assertEqual(analysis["degradation_flags"], ["openai_responses_fallback"])

    def test_model_claim_analysis_flags_suspicious_alias(self):
        analysis = _analyze_model_claims(
            "claude-3-opus",
            [
                {
                    "endpoint": "openai_chat_completions",
                    "available": True,
                    "ttft_ms": 120,
                    "response_preview": "model: gpt-4o-mini",
                    "error_message": None,
                }
            ],
        )

        self.assertEqual(analysis["authenticity_score"], 0.55)
        self.assertEqual(analysis["degradation_flags"], ["wrapper_suspected"])

    def test_batch_diagnostics_reports_performance_and_capability_summary(self):
        diagnostics = _summarize_batch_diagnostics(
            [
                {
                    "model_id": "gpt-4o-mini",
                    "available": True,
                    "ttft_ms": 120,
                    "degradation_flags": [],
                },
                {
                    "model_id": "claude-3-opus",
                    "available": True,
                    "ttft_ms": 12000,
                    "degradation_flags": ["wrapper_suspected"],
                },
                {
                    "model_id": "gpt-4o-mini-vision",
                    "available": False,
                    "ttft_ms": 500,
                    "degradation_flags": ["quota_or_credit_error"],
                    "capability_flags": ["vision_declared"],
                },
            ],
            duration_ms=15000,
        )

        self.assertEqual(diagnostics["available_ratio"], 0.67)
        self.assertEqual(diagnostics["avg_ttft_ms"], 6060)
        self.assertEqual(diagnostics["capability_summary"]["vision_declared"], 1)
        self.assertEqual(diagnostics["risk_summary"]["wrapper_suspected"], 1)
        self.assertEqual(diagnostics["risk_summary"]["quota_or_credit_error"], 1)


if __name__ == "__main__":
    unittest.main()
