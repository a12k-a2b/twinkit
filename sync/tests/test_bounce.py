import tempfile
import unittest
from pathlib import Path

from twinkit_sync.apps import AppHooks, bounce_notification_text
from twinkit_sync.bounce import BounceRefused, plan_bounce, run_bounce
from twinkit_sync.config import SyncConfig, VaultConfig, MachineMap
from twinkit_sync.host import HostFacts
from twinkit_sync.idle import IdleProbes, ProcInfo
from twinkit_sync.lock import checkout
from twinkit_sync.vault import mark_local_dirty


NOW = 1_800_000_000


def cfg(vault: Path, machine_id: str = "air") -> SyncConfig:
    return SyncConfig(
        machine_id=machine_id,
        machines={
            "air": MachineMap("air", "/Users/anjan", "Air"),
            "mini": MachineMap("mini", "/Users/anjanmacmini", "Mini"),
            "other": MachineMap("other", "/Users/Shared/twin-other", "Other"),
        },
        vault=VaultConfig(transport="syncthing", path=str(vault)),
        notify=True,
    )


def quiet_cursor() -> HostFacts:
    return HostFacts(
        now=NOW,
        probes_by_harness={
            "cursor": IdleProbes(
                now=NOW,
                processes=[ProcInfo(pid=1, name="Cursor", cmdline="Cursor", cpu=0.2)],
                session_mtimes=[NOW - 40 * 60],
                app_running=True,
            )
        },
    )


def mid_run_cursor() -> HostFacts:
    return HostFacts(
        now=NOW,
        probes_by_harness={
            "cursor": IdleProbes(
                now=NOW,
                processes=[
                    ProcInfo(pid=1, name="Cursor", cmdline="Cursor", cpu=1.0),
                    ProcInfo(pid=2, name="cursor-agent", cmdline="cursor-agent", cpu=30.0, parent_pid=1),
                ],
                session_mtimes=[NOW - 5],
                app_running=True,
            )
        },
    )


class BounceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name)
        (self.vault / ".twinkit").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_idle_bounce_quits_syncs_relaunches(self):
        hooks = AppHooks()
        synced = []

        def sync_fn(c, hs):
            synced.append(list(hs))

        plan = run_bounce(
            cfg(self.vault),
            ["cursor"],
            host=quiet_cursor(),
            hooks=hooks,
            sync_fn=sync_fn,
        )
        self.assertEqual(plan.action, "bounce")
        self.assertEqual(hooks.quits, ["cursor"])
        self.assertEqual(hooks.relaunches, ["cursor"])
        self.assertEqual(synced, [["cursor"]])
        self.assertEqual(plan.notification, "TwinKit Sync bounced Cursor")
        self.assertEqual(hooks.notifications, [plan.notification])

    def test_never_bounce_mid_run(self):
        plan = plan_bounce(cfg(self.vault), ["cursor"], host=mid_run_cursor())
        self.assertEqual(plan.action, "skip")
        self.assertEqual(plan.reason, "mid_run")

    def test_now_requires_force(self):
        with self.assertRaises(BounceRefused):
            plan_bounce(cfg(self.vault), ["cursor"], now=True, force=False, host=quiet_cursor())

    def test_now_force_quits_even_if_not_idle(self):
        busy = HostFacts(
            now=NOW,
            probes_by_harness={
                "cursor": IdleProbes(
                    now=NOW,
                    processes=[ProcInfo(pid=1, name="Cursor", cmdline="Cursor", cpu=0.2)],
                    session_mtimes=[NOW - 5 * 60],
                    app_running=True,
                )
            },
        )
        plan = plan_bounce(cfg(self.vault), ["cursor"], now=True, force=True, host=busy)
        self.assertEqual(plan.action, "bounce")
        self.assertEqual(plan.reason, "now_force")
        # Still refuse mid-run even with --now --force.
        plan2 = plan_bounce(cfg(self.vault), ["cursor"], now=True, force=True, host=mid_run_cursor())
        self.assertEqual(plan2.action, "skip")
        self.assertEqual(plan2.reason, "mid_run")

    def test_scheduled_skips_when_not_idle(self):
        busy = HostFacts(
            now=NOW,
            probes_by_harness={
                "cursor": IdleProbes(
                    now=NOW,
                    processes=[ProcInfo(pid=1, name="Cursor", cmdline="Cursor", cpu=0.2)],
                    session_mtimes=[NOW - 5 * 60],
                    app_running=True,
                )
            },
        )
        plan = plan_bounce(cfg(self.vault), ["cursor"], scheduled=True, host=busy)
        self.assertEqual(plan.action, "skip")
        self.assertEqual(plan.reason, "scheduled_not_idle")

    def test_scheduled_idle_bounces(self):
        plan = plan_bounce(cfg(self.vault), ["cursor"], scheduled=True, host=quiet_cursor())
        self.assertEqual(plan.action, "bounce")
        self.assertEqual(plan.reason, "scheduled_idle")

    def test_scheduled_lock_holder_peer_stale(self):
        checkout(self.vault, "air")
        mark_local_dirty(self.vault)
        busy = HostFacts(
            now=NOW,
            probes_by_harness={
                "cursor": IdleProbes(
                    now=NOW,
                    processes=[ProcInfo(pid=1, name="Cursor", cmdline="Cursor", cpu=0.2)],
                    session_mtimes=[NOW - 5 * 60],
                    app_running=True,
                )
            },
        )
        plan = plan_bounce(cfg(self.vault), ["cursor"], scheduled=True, host=busy)
        self.assertEqual(plan.action, "bounce")
        self.assertEqual(plan.reason, "scheduled_lock_holder_peer_stale")

    def test_notification_names(self):
        self.assertEqual(
            bounce_notification_text(["cursor", "codex"]),
            "TwinKit Sync bounced Cursor+Codex",
        )


if __name__ == "__main__":
    unittest.main()
