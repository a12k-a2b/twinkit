import json
import os
import tempfile
import unittest
from pathlib import Path

from twinkit_sync.adapters.claude import ClaudeAdapter
from twinkit_sync.adapters.codex import CodexAdapter
from twinkit_sync.adapters.cursor import CursorAdapter
from twinkit_sync.config import MachineMap, SyncConfig, VaultConfig
from twinkit_sync.pack import SecretScanError, pack_harnesses, unpack_harnesses
from twinkit_sync.paths import escape_abs, path_map_from_config


def make_cfg(home: Path, vault: Path, machine_id="mini") -> SyncConfig:
    return SyncConfig(
        machine_id=machine_id,
        machines={
            "air": MachineMap("air", "/Users/anjan", "Air"),
            "mini": MachineMap("mini", str(home), "Mini"),
            "other": MachineMap("other", "/Users/Shared/twin-other", "Other"),
        },
        vault=VaultConfig(transport="syncthing", path=str(vault)),
        claude_homes=["~/.claude", "~/.claude-b"],
        sessions_last_n_days=30,
    )


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.vault = self.root / "vault"
        self.home.mkdir()
        self.vault.mkdir()
        os.environ["HOME"] = str(self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def test_codex_skips_auth_and_old_sessions(self):
        src = self.home / ".codex"
        (src / "sessions" / "2019" / "01" / "01").mkdir(parents=True)
        (src / "sessions" / "2019" / "01" / "01" / "old.jsonl").write_text("old\n")
        (src / "config.toml").write_text("model = \"x\"\n")
        (src / "auth.json").write_text('{"token":"nope"}\n')
        (src / "AGENTS.md").write_text("# hi\n")
        cfg = make_cfg(self.home, self.vault)
        result = CodexAdapter().pack(cfg, self.vault, home=str(self.home))
        self.assertFalse((self.vault / "codex" / "auth.json").exists())
        self.assertTrue((self.vault / "codex" / "config.toml").exists())
        self.assertFalse((self.vault / "codex" / "sessions" / "2019" / "01" / "01" / "old.jsonl").exists())
        self.assertGreaterEqual(result.files, 2)

    def test_cursor_skips_sqlite_while_running(self):
        user = self.home / "Library/Application Support/Cursor/User"
        (user / "globalStorage").mkdir(parents=True)
        (user / "settings.json").write_text("{}\n")
        (user / "globalStorage" / "state.vscdb").write_bytes(b"sqlite")
        skills = self.home / ".cursor" / "skills" / "foo"
        skills.mkdir(parents=True)
        (skills / "SKILL.md").write_text("# skill\n")
        cfg = make_cfg(self.home, self.vault)
        CursorAdapter().pack(cfg, self.vault, home=str(self.home), apps_running=True, deep=True)
        self.assertTrue((self.vault / "cursor" / "dot-cursor" / "skills" / "foo" / "SKILL.md").exists())
        self.assertFalse((self.vault / "cursor" / "user" / "globalStorage" / "state.vscdb").exists())

    def test_claude_dual_profile_and_rewrite_on_import(self):
        mini_home = "/Users/anjanmacmini"
        # Use a fake mini home path inside tmp so we can still write files,
        # but identity records use escaped names as Claude does.
        claude = self.home / ".claude" / "projects" / escape_abs(f"{mini_home}/Projects/foo")
        claude.mkdir(parents=True)
        (claude / "session.json").write_text(json.dumps({"cwd": f"{mini_home}/Projects/foo"}) + "\n")
        claudeb = self.home / ".claude-b"
        claudeb.mkdir()
        (claudeb / "settings.json").write_text("{}\n")
        (self.home / ".claude" / "auth.json").write_text("{}\n")  # must not pack

        cfg = make_cfg(self.home, self.vault, machine_id="mini")
        cfg.machines["mini"].home = mini_home
        # Pack reads from real HOME files; identity uses config homes.
        ClaudeAdapter().pack(cfg, self.vault, home=str(self.home))
        self.assertFalse((self.vault / "claude" / ".claude" / "auth.json").exists())
        ident = json.loads((self.vault / "claude" / "project-identity.json").read_text())
        self.assertTrue(ident)
        self.assertEqual(ident[0]["root_relative"], "Projects/foo")

        # Import onto Air
        air_home = self.root / "airhome"
        air_home.mkdir()
        air_cfg = make_cfg(air_home, self.vault, machine_id="air")
        air_cfg.machines["air"].home = "/Users/anjan"
        air_cfg.machines["mini"].home = mini_home
        unpack_harnesses(air_cfg, self.vault, ["claude"], home=str(air_home))
        dest_projects = air_home / ".claude" / "projects"
        names = [p.name for p in dest_projects.iterdir()] if dest_projects.exists() else []
        self.assertTrue(names, "expected rewritten Claude project dirs")
        self.assertTrue(
            any(n == escape_abs("/Users/anjan/Projects/foo") for n in names),
            names,
        )
        session = dest_projects / escape_abs("/Users/anjan/Projects/foo") / "session.json"
        self.assertTrue(session.is_file())
        self.assertIn("/Users/anjan/Projects/foo", session.read_text())
        self.assertNotIn("anjanmacmini", session.read_text())

    def test_secret_scan_blocks_push(self):
        cfg = make_cfg(self.home, self.vault)
        (self.home / ".codex").mkdir()
        (self.home / ".codex" / "config.toml").write_text('token = "sk-abcdefghijklmnopqrst"\n')
        with self.assertRaises(SecretScanError):
            pack_harnesses(cfg, self.vault, ["codex"], home=str(self.home))


if __name__ == "__main__":
    unittest.main()
