import tempfile
import unittest
from pathlib import Path

from twinkit_sync.lock import LockError, checkout, holds_lock, read_lock, release, require_holder


class LockTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_checkout_and_release_roundtrip(self):
        state = checkout(self.vault, "air")
        self.assertEqual(state.holder, "air")
        self.assertTrue(holds_lock(self.vault, "air"))
        self.assertFalse(holds_lock(self.vault, "mini"))
        release(self.vault, "air")
        self.assertIsNone(read_lock(self.vault).holder)

    def test_second_machine_blocked(self):
        checkout(self.vault, "mini")
        with self.assertRaises(LockError) as ctx:
            checkout(self.vault, "air")
        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("mini", str(ctx.exception))

    def test_force_steal(self):
        checkout(self.vault, "mini")
        state = checkout(self.vault, "other", force=True)
        self.assertEqual(state.holder, "other")

    def test_release_wrong_machine(self):
        checkout(self.vault, "air")
        with self.assertRaises(LockError):
            release(self.vault, "mini")

    def test_three_machines_serial(self):
        for mid in ("air", "mini", "other"):
            checkout(self.vault, mid)
            self.assertTrue(holds_lock(self.vault, mid))
            release(self.vault, mid)
        self.assertIsNone(read_lock(self.vault).holder)

    def test_reentry_same_machine(self):
        checkout(self.vault, "air")
        again = checkout(self.vault, "air")
        self.assertEqual(again.holder, "air")

    def test_require_holder(self):
        with self.assertRaises(LockError):
            require_holder(self.vault, "air", action="push")
        checkout(self.vault, "air")
        require_holder(self.vault, "air", action="push")

    def test_unknown_machine(self):
        with self.assertRaises(LockError):
            checkout(self.vault, "toaster")


if __name__ == "__main__":
    unittest.main()
