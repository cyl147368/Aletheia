import ast
import pathlib
import unittest


class ProbeRouteBatchTypeTest(unittest.TestCase):
    def setUp(self):
        self.source = pathlib.Path("routes/probe.py").read_text(encoding="utf-8")
        self.tree = ast.parse(self.source)

    def _function(self, name):
        return next(
            node
            for node in self.tree.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == name
        )

    def test_save_probe_result_accepts_batch_type(self):
        save_probe_result = self._function("_save_probe_result")
        arg_names = [arg.arg for arg in save_probe_result.args.args]

        self.assertIn("batch_type", arg_names)
        self.assertIn('batch_type: str = "probe"', self.source)
        self.assertIn("batch_type=batch_type", self.source)
        self.assertIn('"batch_type": batch_type', self.source)
        self.assertIn('"status": s.status', self.source)

    def test_station_status_updates_are_probe_only(self):
        self.assertIn('if batch_type == "probe":', self.source)
        self.assertIn('s.status = "down"', self.source)
        self.assertIn("s.last_probe_at = now", self.source)
        self.assertIn("s.updated_at = now", self.source)

    def test_latest_probe_and_deep_results_are_separate(self):
        latest_result = self._function("latest_result")
        latest_deep_result = self._function("latest_deep_result")

        latest_source = ast.get_source_segment(self.source, latest_result)
        deep_source = ast.get_source_segment(self.source, latest_deep_result)
        self.assertIn('ProbeBatch.batch_type == "probe"', latest_source)
        self.assertIn('ProbeBatch.batch_type == "deep"', deep_source)
        self.assertIn('/stations/{station_id}/history/latest/deep', self.source)

    def test_latest_results_support_summary_mode(self):
        latest_result = self._function("latest_result")
        latest_deep_result = self._function("latest_deep_result")

        for fn in (latest_result, latest_deep_result):
            arg_names = [arg.arg for arg in fn.args.args]
            source = ast.get_source_segment(self.source, fn)

            self.assertIn("summary", arg_names)
            self.assertIn("select(ModelResult.id, ModelResult.model_id, ModelResult.available, ModelResult.ttft_ms)", source)
            self.assertIn("None if summary else m.request_body", source)
            self.assertIn("None if summary else m.response_body", source)

    def test_batch_detail_returns_full_payloads(self):
        batch_detail = self._function("batch_detail")
        source = ast.get_source_segment(self.source, batch_detail)

        self.assertNotIn("summary", [arg.arg for arg in batch_detail.args.args])
        self.assertIn('"request_body": m.request_body', source)
        self.assertIn('"response_body": m.response_body', source)
        self.assertNotIn("None if summary else", source)

    def test_route_overview_is_database_only(self):
        route_overview = self._function("route_overview")
        source = ast.get_source_segment(self.source, route_overview)

        self.assertIn('/route-overview', self.source)
        self.assertIn('ProbeBatch.batch_type == "probe"', source)
        self.assertIn("ModelResult.available == 1", source)
        self.assertIn('"stations": list(stations_by_id.values())', source)
        self.assertIn('"results": list(results_by_station.values())', source)
        self.assertNotIn("list_model_catalog", source)
        self.assertNotIn("probe_station", source)
        self.assertNotIn("deep_probe_station", source)


if __name__ == "__main__":
    unittest.main()
