import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI, HTTPException

from static_files import SPAStaticFiles


class StaticRouteFallbackTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        static_dir = Path(self.temp_dir.name)
        (static_dir / "index.html").write_text("<!doctype html><main>Aletheia</main>", encoding="utf-8")
        (static_dir / "assets").mkdir()
        (static_dir / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")

        self.app = FastAPI()

        @self.app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
        async def api_not_found(path: str):
            raise HTTPException(status_code=404, detail="Not Found")

        self.app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")

    async def asyncTearDown(self):
        self.temp_dir.cleanup()

    async def _request(self, method: str, path: str):
        messages = []

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [(b"host", b"test")],
            "client": ("test", 50000),
            "server": ("test", 80),
            "root_path": "",
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            messages.append(message)

        await self.app(scope, receive, send)

        start = next(message for message in messages if message["type"] == "http.response.start")
        body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        headers = {
            key.decode().lower(): value.decode()
            for key, value in start["headers"]
        }
        return start["status"], headers, body.decode("utf-8", errors="replace")

    async def test_spa_routes_fallback_to_index_html(self):
        status, headers, body = await self._request("GET", "/stations/6")
        head_status, head_headers, _ = await self._request("HEAD", "/stations/6")

        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["content-type"])
        self.assertIn("Aletheia", body)
        self.assertEqual(head_status, 200)
        self.assertIn("text/html", head_headers["content-type"])

    async def test_unknown_api_routes_do_not_fallback_to_spa(self):
        root_status, _, root_body = await self._request("GET", "/api")
        status, _, body = await self._request("GET", "/api/missing")

        self.assertEqual(root_status, 404)
        self.assertEqual(root_body, '{"detail":"Not Found"}')
        self.assertEqual(status, 404)
        self.assertEqual(body, '{"detail":"Not Found"}')

    async def test_missing_static_assets_do_not_fallback_to_spa(self):
        status, _, body = await self._request("GET", "/assets/missing.js")

        self.assertEqual(status, 404)
        self.assertNotIn("Aletheia", body)


if __name__ == "__main__":
    unittest.main()
