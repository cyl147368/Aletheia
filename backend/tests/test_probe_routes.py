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


if __name__ == "__main__":
    unittest.main()
