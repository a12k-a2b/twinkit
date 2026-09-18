"""Idle bounce: quit → cold sync → relaunch → notify.

Anjan almost never closes apps. Scheduled bounce only fires when harnesses
look idle, or when this machine holds the exclusive lock and peers need an
update. Never bounce if an agent is clearly mid-run.

``--now`` skips the idle wait (apps may be open). ``--force`` skips the
confirmation that ``--now`` otherwise requires. Mid-run is still a hard stop
unless both ``--now`` and ``--force`` are set *and* ``allow_mid_run`` is
explicitly True — the public CLI never sets that.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from twinkit_sync.apps import AppHooks, bounce_notification_text
from twinkit_sync.config import SyncConfig
from twinkit_sync.host import HostFacts, idle_reports
from twinkit_sync.idle import IdleReport, summarize_reports
from twinkit_sync.lock import holds_lock
from twinkit_sync.vault import peer_needs_update


class BounceRefused(Exception):
    def __init__(self, message: str, *, code: int = 2):
        super().__init__(message)
        self.code = code


@dataclass
class BouncePlan:
    harnesses: list[str]
    action: str  # bounce | skip
    reason: str
    reports: list[IdleReport] = field(default_factory=list)
    quits: list[str] = field(default_factory=list)
    relaunches: list[str] = field(default_factory=list)
    notification: str = ""

    def to_dict(self) -> dict:
        return {
            "harnesses": list(self.harnesses),
            "action": self.action,
            "reason": self.reason,
            "idle": summarize_reports(self.reports),
            "quits": list(self.quits),
            "relaunches": list(self.relaunches),
            "notification": self.notification,
        }


def plan_bounce(
    cfg: SyncConfig,
    harnesses: list[str],
    *,
    now: bool = False,
    force: bool = False,
    scheduled: bool = False,
    host: HostFacts | None = None,
    home: str | None = None,
    allow_mid_run: bool = False,
) -> BouncePlan:
    reports = idle_reports(cfg, harnesses, host=host, home=home)
    summary = summarize_reports(reports)
    vault = cfg.vault_path(home)
    we_hold = holds_lock(vault, cfg.machine_id)
    peer_stale = peer_needs_update(vault, cfg.machine_id)

    if summary["mid_run"] and not allow_mid_run:
        return BouncePlan(
            harnesses=harnesses,
            action="skip",
            reason="mid_run",
            reports=reports,
        )

    if scheduled:
        if summary["idle"]:
            return BouncePlan(harnesses=harnesses, action="bounce", reason="scheduled_idle", reports=reports)
        if we_hold and peer_stale:
            return BouncePlan(
                harnesses=harnesses,
                action="bounce",
                reason="scheduled_lock_holder_peer_stale",
                reports=reports,
            )
        return BouncePlan(harnesses=harnesses, action="skip", reason="scheduled_not_idle", reports=reports)

    if now:
        if not force:
            raise BounceRefused("bounce --now requires --force (Anjan, this quits open apps)")
        return BouncePlan(harnesses=harnesses, action="bounce", reason="now_force", reports=reports)

    if not summary["idle"]:
        return BouncePlan(harnesses=harnesses, action="skip", reason="not_idle", reports=reports)
    return BouncePlan(harnesses=harnesses, action="bounce", reason="idle", reports=reports)


def run_bounce(
    cfg: SyncConfig,
    harnesses: list[str],
    *,
    now: bool = False,
    force: bool = False,
    scheduled: bool = False,
    host: HostFacts | None = None,
    home: str | None = None,
    hooks: AppHooks | None = None,
    sync_fn=None,
    allow_mid_run: bool = False,
) -> BouncePlan:
    plan = plan_bounce(
        cfg,
        harnesses,
        now=now,
        force=force,
        scheduled=scheduled,
        host=host,
        home=home,
        allow_mid_run=allow_mid_run,
    )
    if plan.action != "bounce":
        return plan
    hooks = hooks or AppHooks()
    running = [h for h in harnesses if any(r.harness == h and r.app_running for r in plan.reports)]
    # Quit everything we were asked to bounce (idle-open apps still need quit
    # so we can cold-copy SQLite / avoid writer races).
    for hid in harnesses:
        hooks.quit(hid)
        plan.quits.append(hid)
    if sync_fn:
        sync_fn(cfg, harnesses)
    for hid in harnesses:
        # Relaunch apps that were running, plus GUI harnesses we quit.
        if hid in running or hid in {"cursor", "ag"}:
            hooks.relaunch(hid)
            plan.relaunches.append(hid)
    plan.notification = bounce_notification_text(harnesses)
    if cfg.notify:
        hooks.notify(plan.notification)
    return plan
