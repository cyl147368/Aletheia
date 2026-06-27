import ast
import pathlib
import unittest


class StationImportItemTest(unittest.TestCase):
    def test_import_item_declares_schedule_settings(self):
        source = pathlib.Path("routes/stations.py").read_text()
        tree = ast.parse(source)
        import_item = next(
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name == "StationImportItem"
        )
        fields = {
            stmt.target.id: stmt
            for stmt in import_item.body
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)
        }

        self.assertIn("schedule_enabled", fields)
        self.assertIn("schedule_interval_hours", fields)
        self.assertIsInstance(fields["schedule_enabled"].value, ast.Constant)
        self.assertIs(fields["schedule_enabled"].value.value, True)
        self.assertIsInstance(fields["schedule_interval_hours"].value, ast.Constant)
        self.assertEqual(fields["schedule_interval_hours"].value.value, 6)


if __name__ == "__main__":
    unittest.main()
