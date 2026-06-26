import unittest
from types import SimpleNamespace

from services.probe import _build_probe_request, _build_probe_requests


def probe_settings():
    return SimpleNamespace(probe_prompt="hi", probe_max_tokens=5)


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


if __name__ == "__main__":
    unittest.main()
