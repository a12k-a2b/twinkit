import json
import tempfile
import unittest
from pathlib import Path

from twinkit_sync.paths import (
    PathMap,
    escape_abs,
    identity_record,
    resolve_identity,
    rewrite_filename,
    rewrite_text,
    rewrite_tree,
    root_relative,
    unescape_abs,
)


AIR = "/Users/anjan"
MINI = "/Users/anjanmacmini"
CANON = "/Users/Shared/Projects"


def air_map() -> PathMap:
    return PathMap(
        local_home=AIR,
        peer_homes=[MINI, "/Users/Shared/twin-other"],
        canon_roots=[CANON],
        machine_homes={"air": AIR, "mini": MINI, "other": "/Users/Shared/twin-other"},
    )


def mini_map() -> PathMap:
    return PathMap(
        local_home=MINI,
        peer_homes=[AIR],
        canon_roots=[CANON],
    )


class PathRewriteTests(unittest.TestCase):
    def test_absolute_home_rewrite_mini_to_air(self):
        text = json.dumps({"cwd": f"{MINI}/Projects/interlude", "ok": True})
        out = rewrite_text(text, air_map())
        self.assertIn(f"{AIR}/Projects/interlude", out)
        self.assertNotIn("anjanmacmini", out)

    def test_does_not_clobber_local_home(self):
        text = f"{AIR}/Projects/foo"
        self.assertEqual(rewrite_text(text, air_map()), text)

    def test_escaped_claude_project_dir(self):
        escaped = escape_abs(f"{MINI}/Projects/foo")
        self.assertEqual(escaped, "-Users-anjanmacmini-Projects-foo")
        rewritten = rewrite_filename(escaped, air_map())
        self.assertEqual(rewritten, "-Users-anjan-Projects-foo")
        self.assertEqual(unescape_abs(rewritten), f"{AIR}/Projects/foo")

    def test_json_slash_escaped(self):
        text = r"\/Users\/anjanmacmini\/Projects\/x"
        out = rewrite_text(text, air_map())
        self.assertIn(r"\/Users\/anjan\/Projects\/x", out)

    def test_url_encoded(self):
        from urllib.parse import quote

        text = quote(f"{MINI}/Projects/x", safe="")
        out = rewrite_text(text, air_map())
        self.assertIn(quote(f"{AIR}/Projects/x", safe=""), out)

    def test_canon_root_untouched(self):
        text = f"{CANON}/daylight/src/main.ts"
        self.assertEqual(rewrite_text(text, air_map()), text)
        self.assertEqual(rewrite_text(text, mini_map()), text)

    def test_longest_prefix_wins(self):
        # If we rewrote /Users/anjan first, /Users/anjanmacmini would become
        # /Users/anjanmacmini → /Users/anjan + macmini leftover — or worse.
        text = f"{MINI}/x"
        out = rewrite_text(text, air_map())
        self.assertEqual(out, f"{AIR}/x")

    def test_air_prefix_does_not_corrupt_mini_when_importing_on_mini(self):
        mixed = json.dumps(
            {
                "already_mini": f"{MINI}/Projects/x",
                "from_air": f"{AIR}/Projects/y",
                "escaped_mini": escape_abs(f"{MINI}/Projects/x"),
                "escaped_air": escape_abs(f"{AIR}/Projects/y"),
            }
        )
        out = rewrite_text(mixed, mini_map())
        self.assertIn(f"{MINI}/Projects/x", out)
        self.assertIn(f"{MINI}/Projects/y", out)
        self.assertNotIn("anjanmacminiminimacmini", out)
        self.assertIn(escape_abs(f"{MINI}/Projects/x"), out)
        self.assertIn(escape_abs(f"{MINI}/Projects/y"), out)
        self.assertNotIn(escape_abs(f"{AIR}/Projects/y"), out)

    def test_root_relative_strips_home(self):
        rel = root_relative(f"{MINI}/Projects/interlude", [AIR, MINI], [CANON])
        self.assertEqual(rel, "Projects/interlude")

    def test_root_relative_canon(self):
        rel = root_relative(f"{CANON}/glass-lock", [AIR, MINI], [CANON])
        self.assertEqual(rel, "glass-lock")

    def test_resolve_identity_prefers_local_home(self):
        dest = resolve_identity(
            root_rel="Projects/interlude",
            path_map=air_map(),
            source_abs=f"{MINI}/Projects/interlude",
        )
        self.assertEqual(dest, f"{AIR}/Projects/interlude")

    def test_resolve_identity_keeps_canon(self):
        dest = resolve_identity(
            root_rel="glass-lock",
            path_map=air_map(),
            source_abs=f"{CANON}/glass-lock",
        )
        self.assertEqual(dest, f"{CANON}/glass-lock")

    def test_identity_record(self):
        rec = identity_record(
            kind="claude-project",
            abs_path=f"{MINI}/Projects/foo",
            path_map=air_map(),
        )
        self.assertEqual(rec["root_relative"], "Projects/foo")
        self.assertEqual(rec["resolved"], f"{AIR}/Projects/foo")

    def test_rewrite_tree_renames_claude_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            proj = root / "projects" / escape_abs(f"{MINI}/Projects/foo")
            proj.mkdir(parents=True)
            (proj / "session.json").write_text(
                json.dumps({"cwd": f"{MINI}/Projects/foo"}) + "\n"
            )
            stats = rewrite_tree(root, air_map(), rename=True)
            self.assertGreaterEqual(stats["files"], 1)
            dest = root / "projects" / escape_abs(f"{AIR}/Projects/foo")
            self.assertTrue(dest.is_dir())
            body = (dest / "session.json").read_text()
            self.assertIn(f"{AIR}/Projects/foo", body)
            self.assertNotIn("anjanmacmini", body)


if __name__ == "__main__":
    unittest.main()
