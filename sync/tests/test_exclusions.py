import tempfile
import unittest
from pathlib import Path

from twinkit_sync.exclusions import is_never_sync, iter_packable_files


class ExclusionTests(unittest.TestCase):
    def test_auth_json(self):
        self.assertTrue(is_never_sync("codex/auth.json"))
        self.assertTrue(is_never_sync("/Users/anjan/.codex/auth.json"))

    def test_glass_locks(self):
        self.assertTrue(is_never_sync("/Users/anjan/.daylight/glass/holder.json"))

    def test_adb_state(self):
        self.assertTrue(is_never_sync("/Users/anjan/.android/adbkey"))

    def test_statsig_and_wal(self):
        self.assertTrue(is_never_sync("claude/statsig/log"))
        self.assertTrue(is_never_sync("user/globalStorage/state.vscdb-wal"))

    def test_credentials(self):
        self.assertTrue(is_never_sync(".claude/.credentials.json"))

    def test_allows_sessions_and_skills(self):
        self.assertFalse(is_never_sync("codex/sessions/2026/09/18/rollout-1.jsonl"))
        self.assertFalse(is_never_sync("dot-cursor/skills/foo/SKILL.md"))
        self.assertFalse(is_never_sync(".claude/projects/-Users-anjan-x/session.json"))

    def test_walk_skips_auth(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions").mkdir()
            (root / "sessions" / "ok.jsonl").write_text("{}\n")
            (root / "auth.json").write_text("{}\n")
            files = [p.name for p in iter_packable_files(root)]
            self.assertIn("ok.jsonl", files)
            self.assertNotIn("auth.json", files)


if __name__ == "__main__":
    unittest.main()
