import json
import os
import tempfile
import unittest
from pathlib import Path

from twinkit_sync import __version__
from twinkit_sync.cli import main
from twinkit_sync.schedule import IDLE_LABEL, NIGHTLY_LABEL, install_schedule, render_plist, IDLE_PLIST


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.config = self.root / "config.json"
        self.vault = self.root / "vault"
        os.environ["HOME"] = str(self.home)
        os.environ["TWINKIT_SYNC_ROOT"] = str(self.root / "sync-root")
        os.environ["TWINKIT_SYNC_CONFIG"] = str(self.config)
        os.environ["TWINKIT_SYNC_VAULT"] = str(self.vault)
        os.environ["TWINKIT_MACHINE_ID"] = "air"

    def tearDown(self):
        self.tmp.cleanup()

    def test_init_status_doctor_checkout_release(self):
        rc = main(
            [
                "--config",
                str(self.config),
                "init",
                "--machine",
                "air",
                "--transport",
                "syncthing",
                "--vault",
                str(self.vault),
                "--air-home",
                str(self.home),
            ]
        )
        self.assertEqual(rc, 0)
        data = json.loads(self.config.read_text())
        self.assertEqual(data["machine_id"], "air")
        self.assertEqual(data["vault"]["transport"], "syncthing")

        rc = main(["--config", str(self.config), "status", "--json"])
        self.assertEqual(rc, 0)

        rc = main(["--config", str(self.config), "doctor"])
        self.assertEqual(rc, 0)

        rc = main(["--config", str(self.config), "checkout"])
        self.assertEqual(rc, 0)
        lock = json.loads((self.vault / ".twinkit" / "lock.json").read_text())
        self.assertEqual(lock["holder"], "air")

        rc = main(["--config", str(self.config), "release"])
        self.assertEqual(rc, 0)
        lock = json.loads((self.vault / ".twinkit" / "lock.json").read_text())
        self.assertIn(lock["holder"], (None, ""))

    def test_bounce_now_without_force_fails(self):
        main(
            [
                "--config",
                str(self.config),
                "init",
                "--machine",
                "air",
                "--transport",
                "syncthing",
                "--vault",
                str(self.vault),
            ]
        )
        rc = main(["--config", str(self.config), "bounce", "--now"])
        self.assertEqual(rc, 2)

    def test_schedule_plist_render(self):
        body = render_plist(IDLE_PLIST, bin_path="/opt/twinkit-sync", home="/Users/anjan")
        self.assertIn("/opt/twinkit-sync", body)
        self.assertIn("<integer>10800</integer>", body)
        self.assertIn("bounce", body)
        self.assertIn("--scheduled", body)
        dest = self.home
        written = install_schedule(home=str(dest), bin_path="/opt/twinkit-sync")
        self.assertIn(IDLE_LABEL, written)
        self.assertIn(NIGHTLY_LABEL, written)
        nightly = written[NIGHTLY_LABEL].read_text()
        self.assertIn("<integer>2</integer>", nightly)
        self.assertIn("--deep", nightly)

    def test_version_constant(self):
        self.assertTrue(__version__)


if __name__ == "__main__":
    unittest.main()
