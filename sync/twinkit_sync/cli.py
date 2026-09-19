"""TwinKit Sync CLI.

    twinkit sync init | status | push | pull | sync | checkout | release
    twinkit sync bounce [--harness …] [--now] [--force] [--scheduled]
    twinkit sync schedule install | uninstall
    twinkit sync doctor
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from twinkit_sync import HARNESS_IDS, MACHINE_IDS, __version__
from twinkit_sync.apps import AppHooks
from twinkit_sync.bounce import BounceRefused, run_bounce
from twinkit_sync.config import (
    SyncConfig,
    default_config_path,
    init_config,
    load_config,
)
from twinkit_sync.doctor import run_doctor
from twinkit_sync.host import HostFacts, idle_reports
from twinkit_sync.lock import LockError, checkout as lock_checkout, read_lock, release as lock_release
from twinkit_sync.pack import SecretScanError, pack_harnesses, unpack_harnesses
from twinkit_sync.schedule import install_schedule, uninstall_schedule
from twinkit_sync.vault import (
    VaultError,
    init_vault,
    mark_pulled,
    mark_pushed,
    peer_needs_update,
    vault_pull,
    vault_push,
)


def _parse_harnesses(raw: str | None, cfg: SyncConfig) -> list[str]:
    if not raw:
        return cfg.enabled_harnesses()
    items = [p.strip() for p in raw.split(",") if p.strip()]
    bad = [h for h in items if h not in HARNESS_IDS]
    if bad:
        raise SystemExit(f"unknown harness: {', '.join(bad)} (want {', '.join(HARNESS_IDS)})")
    return items


def _load(args) -> SyncConfig:
    path = Path(args.config) if getattr(args, "config", None) else default_config_path()
    if not path.is_file():
        raise SystemExit(f"no config at {path} — run: twinkit sync init")
    return load_config(path)


def cmd_init(args) -> int:
    cfg = init_config(
        machine_id=args.machine,
        transport=args.transport,
        vault=args.vault,
        remote=args.remote or "",
        air_home=args.air_home,
        mini_home=args.mini_home,
        other_home=args.other_home,
        path=Path(args.config) if args.config else None,
    )
    vault = init_vault(cfg)
    print(f"TwinKit Sync {__version__}")
    print(f"  machine:  {cfg.machine_id}")
    print(f"  home:     {cfg.local_home}")
    print(f"  peers:    air={cfg.home_for('air')}  mini={cfg.home_for('mini')}  other={cfg.home_for('other')}")
    print(f"  vault:    {vault}  ({cfg.vault.transport})")
    print(f"  config:   {default_config_path() if not args.config else args.config}")
    print()
    print("Next: pair the other Macs with the same vault remote/folder,")
    print("      then `twinkit sync checkout` on the desk you will use.")
    return 0


def cmd_status(args) -> int:
    cfg = _load(args)
    vault = cfg.vault_path()
    lock = read_lock(vault)
    harnesses = _parse_harnesses(args.harness, cfg)
    reports = idle_reports(cfg, harnesses)
    payload = {
        "twinkit_sync": __version__,
        "machine_id": cfg.machine_id,
        "local_home": cfg.local_home,
        "vault": str(vault),
        "transport": cfg.vault.transport,
        "lock": lock.to_dict(),
        "we_hold_lock": lock.holder == cfg.machine_id,
        "peer_needs_update": peer_needs_update(vault, cfg.machine_id),
        "harnesses": {r.harness: r.to_dict() for r in reports},
        "canon_roots": list(cfg.canon_roots),
    }
    if args.json:
        print(json.dumps(payload, indent=2))
        return 0
    print(f"TwinKit Sync {__version__}  machine={cfg.machine_id}  home={cfg.local_home}")
    print(f"vault {cfg.vault.transport}: {vault}")
    print(f"lock: {lock.holder or 'free'}" + (f" since {lock.held_at}" if lock.held_at else ""))
    print(f"peer_needs_update: {payload['peer_needs_update']}")
    for hid, info in payload["harnesses"].items():
        flag = "MID-RUN" if info["mid_run"] else ("idle" if info["idle"] else "busy")
        print(f"  {hid:8} {flag:8}  {info['reason']}")
    return 0


def _sync_core(
    cfg: SyncConfig,
    harnesses: list[str],
    *,
    direction: str,
    deep: bool = False,
    force: bool = False,
    running: dict[str, bool] | None = None,
) -> int:
    vault = cfg.vault_path()
    vault.mkdir(parents=True, exist_ok=True)
    if direction in {"pull", "sync"}:
        print(vault_pull(cfg))
        unpack_harnesses(cfg, vault, harnesses)
        mark_pulled(vault, cfg.machine_id)
        print(f"imported {', '.join(harnesses)} (paths rewritten → {cfg.local_home})")
    if direction in {"push", "sync"}:
        pack_harnesses(cfg, vault, harnesses, deep=deep, running=running)
        mark_pushed(vault, cfg.machine_id)
        print(vault_push(cfg, message=f"twinkit-sync: {cfg.machine_id} {direction}"))
    return 0


def cmd_push(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    vault = cfg.vault_path()
    lock = read_lock(vault)
    if lock.holder and lock.holder != cfg.machine_id and not args.force:
        print(f"refusing push: lock held by {lock.holder}", file=sys.stderr)
        return 2
    reports = idle_reports(cfg, harnesses)
    running = {r.harness: r.app_running for r in reports}
    if any(r.mid_run for r in reports) and not args.force:
        print("refusing push: an agent looks mid-run (never pack a live session)", file=sys.stderr)
        return 2
    return _sync_core(cfg, harnesses, direction="push", deep=args.deep, force=args.force, running=running)


def cmd_pull(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    reports = idle_reports(cfg, harnesses)
    if any(r.app_running for r in reports) and not args.force:
        print("refusing pull: a target harness is running (quit or bounce first)", file=sys.stderr)
        return 2
    return _sync_core(cfg, harnesses, direction="pull", deep=args.deep, force=args.force)


def cmd_sync(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    vault = cfg.vault_path()
    we_hold = read_lock(vault).holder == cfg.machine_id
    reports = idle_reports(cfg, harnesses)
    if args.scheduled:
        if any(r.mid_run for r in reports):
            print("scheduled sync skipped: mid-run")
            return 0
        if any(r.app_running for r in reports) and not we_hold:
            print("scheduled sync skipped: apps open and we do not hold the lock")
            return 0
    running = {r.harness: r.app_running for r in reports}
    if we_hold:
        # Pull first so we don't clobber a peer's last release, then pack+push.
        vault_pull(cfg)
        pack_harnesses(cfg, vault, harnesses, deep=args.deep, running=running)
        mark_pushed(vault, cfg.machine_id)
        print(vault_push(cfg, message=f"twinkit-sync: {cfg.machine_id} sync"))
        return 0
    if any(r.app_running for r in reports) and not args.force:
        print("refusing sync: apps open and lock not held — checkout or bounce", file=sys.stderr)
        return 2
    return _sync_core(cfg, harnesses, direction="pull", deep=args.deep)


def cmd_checkout(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    vault = cfg.vault_path()
    vault_pull(cfg)
    lock_checkout(vault, cfg.machine_id, harnesses=harnesses, force=args.force)
    reports = idle_reports(cfg, harnesses)
    if any(r.app_running for r in reports) and not args.force:
        print("lock acquired but import skipped: quit apps or `twinkit sync bounce`", file=sys.stderr)
        return 0
    unpack_harnesses(cfg, vault, harnesses)
    mark_pulled(vault, cfg.machine_id)
    print(f"checked out as {cfg.machine_id}; imported {', '.join(harnesses)}")
    return 0


def cmd_release(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    vault = cfg.vault_path()
    reports = idle_reports(cfg, harnesses)
    running = {r.harness: r.app_running for r in reports}
    if any(r.mid_run for r in reports) and not args.force:
        print("refusing release: agent mid-run", file=sys.stderr)
        return 2
    pack_harnesses(cfg, vault, harnesses, deep=args.deep, running=running)
    mark_pushed(vault, cfg.machine_id)
    print(vault_push(cfg, message=f"twinkit-sync: {cfg.machine_id} release"))
    lock_release(vault, cfg.machine_id, force=args.force)
    print(f"released lock ({cfg.machine_id})")
    return 0


def cmd_bounce(args) -> int:
    cfg = _load(args)
    harnesses = _parse_harnesses(args.harness, cfg)
    hooks = AppHooks()

    def _do_sync(c: SyncConfig, hs: list[str]) -> None:
        vault = c.vault_path()
        vault_pull(c)
        reports = idle_reports(c, hs)
        running = {r.harness: False for r in reports}  # just quit
        if read_lock(vault).holder in {None, c.machine_id}:
            pack_harnesses(c, vault, hs, deep=getattr(args, "deep", False), running=running)
            mark_pushed(vault, c.machine_id)
            print(vault_push(c, message=f"twinkit-sync: {c.machine_id} bounce"))
        unpack_harnesses(c, vault, hs)
        mark_pulled(vault, c.machine_id)

    plan = run_bounce(
        cfg,
        harnesses,
        now=args.now,
        force=args.force,
        scheduled=args.scheduled,
        hooks=hooks,
        sync_fn=_do_sync,
    )
    if args.json:
        print(json.dumps(plan.to_dict(), indent=2))
    else:
        print(f"bounce {plan.action}: {plan.reason}")
        if plan.notification:
            print(plan.notification)
        if plan.action == "skip" and plan.reason == "mid_run":
            print("never bounce while an agent is mid-run", file=sys.stderr)
            return 2
    return 0


def cmd_schedule(args) -> int:
    if args.schedule_action == "install":
        written = install_schedule(bin_path=args.bin)
        print("installed launchd agents:")
        for label, path in written.items():
            print(f"  {label} → {path}")
        print("load with: launchctl load ~/Library/LaunchAgents/com.twinkit.sync.*.plist")
        print("cadence: every 3h idle-gated bounce + nightly 02:00 deep sync")
        return 0
    removed = uninstall_schedule()
    if not removed:
        print("no launchd agents to remove")
    else:
        print("removed:")
        for p in removed:
            print(f"  {p}")
    return 0


def cmd_doctor(args) -> int:
    cfg = None
    try:
        cfg = _load(args)
    except SystemExit:
        cfg = None
    report = run_doctor(cfg)
    worst = 0
    for check in report.checks:
        mark = "ok" if check.ok else "!!"
        if not check.ok:
            worst = 1
        print(f"  [{mark}] {check.id}: {check.detail}")
    return worst


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="twinkit-sync",
        description="Cold-handoff Cursor / Codex / Claude Code / Antigravity across 2–3 Macs.",
    )
    p.add_argument("--version", action="version", version=f"TwinKit Sync {__version__}")
    p.add_argument("--config", help="path to config.json")
    sub = p.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="write config + empty vault")
    init.add_argument("--machine", choices=MACHINE_IDS)
    init.add_argument("--transport", choices=("git", "syncthing"), default="git")
    init.add_argument("--vault")
    init.add_argument("--remote", default="")
    init.add_argument("--air-home")
    init.add_argument("--mini-home")
    init.add_argument("--other-home")
    init.set_defaults(func=cmd_init)

    st = sub.add_parser("status", help="lock, idle, vault")
    st.add_argument("--harness")
    st.add_argument("--json", action="store_true")
    st.set_defaults(func=cmd_status)

    for name, fn, help_ in (
        ("push", cmd_push, "pack this Mac → vault"),
        ("pull", cmd_pull, "vault → import with path rewrite"),
        ("sync", cmd_sync, "push if we hold the lock, else pull"),
    ):
        sp = sub.add_parser(name, help=help_)
        sp.add_argument("--harness")
        sp.add_argument("--deep", action="store_true")
        sp.add_argument("--force", action="store_true")
        sp.add_argument("--scheduled", action="store_true")
        sp.set_defaults(func=fn)

    ch = sub.add_parser("checkout", help="acquire exclusive lock + import")
    ch.add_argument("--harness")
    ch.add_argument("--force", action="store_true")
    ch.set_defaults(func=cmd_checkout)

    rel = sub.add_parser("release", help="pack, push, unlock")
    rel.add_argument("--harness")
    rel.add_argument("--deep", action="store_true")
    rel.add_argument("--force", action="store_true")
    rel.set_defaults(func=cmd_release)

    bo = sub.add_parser("bounce", help="idle quit → sync → relaunch")
    bo.add_argument("--harness", help="comma list: cursor,codex,claude,ag")
    bo.add_argument("--now", action="store_true", help="quit even if not idle")
    bo.add_argument("--force", action="store_true", help="required with --now; skip confirm")
    bo.add_argument("--scheduled", action="store_true", help="launchd mode: idle or lock+stale peers")
    bo.add_argument("--deep", action="store_true")
    bo.add_argument("--json", action="store_true")
    bo.set_defaults(func=cmd_bounce)

    sch = sub.add_parser("schedule", help="install/uninstall launchd agents")
    sch.add_argument("schedule_action", choices=("install", "uninstall"))
    sch.add_argument("--bin", help="twinkit-sync binary path for the plist")
    sch.set_defaults(func=cmd_schedule)

    doc = sub.add_parser("doctor", help="config / vault / lock / exclusions")
    doc.set_defaults(func=cmd_doctor)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except (LockError, BounceRefused, SecretScanError, VaultError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return int(getattr(exc, "code", 1))
    except BrokenPipeError:
        return 0
