"""Health checks for TwinKit Sync."""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path

from twinkit_sync import HARNESS_IDS, MACHINE_IDS
from twinkit_sync.adapters import get_adapter
from twinkit_sync.config import SyncConfig, default_config_path, load_config
from twinkit_sync.exclusions import is_never_sync
from twinkit_sync.lock import read_lock
from twinkit_sync.paths import path_map_from_config, rewrite_text
from twinkit_sync.schedule import IDLE_LABEL, NIGHTLY_LABEL, agents_dir
from twinkit_sync.vault import is_git_repo, read_state


@dataclass
class Check:
    id: str
    ok: bool
    detail: str


@dataclass
class DoctorReport:
    checks: list[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)

    def add(self, cid: str, ok: bool, detail: str) -> None:
        self.checks.append(Check(cid, ok, detail))


def run_doctor(cfg: SyncConfig | None = None, *, home: str | None = None) -> DoctorReport:
    report = DoctorReport()
    report.add("python", True, "python3 present (you are reading this)")
    report.add("git", shutil.which("git") is not None, shutil.which("git") or "git not on PATH")
    rsync = shutil.which("rsync")
    report.add(
        "rsync",
        True,
        rsync or "not on PATH (optional for Sync; twin-pack still wants it)",
    )

    cfg_path = default_config_path(home)
    if cfg is None:
        if not cfg_path.is_file():
            report.add("config", False, f"missing {cfg_path} — run twinkit sync init")
            return report
        try:
            cfg = load_config(cfg_path, home=home)
        except Exception as exc:
            report.add("config", False, f"unreadable: {exc}")
            return report
    report.add("config", True, str(cfg_path))
    report.add(
        "machine_id",
        cfg.machine_id in MACHINE_IDS,
        f"{cfg.machine_id} (air|mini|other)",
    )
    homes_ok = all(cfg.home_for(m) for m in MACHINE_IDS)
    report.add("homes", homes_ok, ", ".join(f"{m}={cfg.home_for(m)}" for m in MACHINE_IDS))

    vault = cfg.vault_path(home)
    report.add("vault", vault.exists(), str(vault))
    if cfg.vault.transport == "git":
        report.add("vault_git", is_git_repo(vault) or not vault.exists(), f"transport=git repo={is_git_repo(vault)}")
    else:
        report.add("vault_syncthing", True, f"transport=syncthing path={vault}")

    lock = read_lock(vault) if vault.exists() else None
    if lock:
        report.add("lock", True, f"holder={lock.holder or 'free'} held_at={lock.held_at or '-'}")
    else:
        report.add("lock", True, "no lock file (free)")

    leaked = []
    if vault.exists():
        for p in vault.rglob("*"):
            if p.is_file() and ".git" not in p.parts:
                rel = p.relative_to(vault).as_posix()
                if is_never_sync(rel):
                    leaked.append(rel)
    report.add("vault_exclusions", not leaked, "clean" if not leaked else f"leaked: {leaked[:8]}")

    pmap = path_map_from_config(cfg)
    sample = "/Users/anjanmacmini/Projects/foo/session.json"
    rewritten = rewrite_text(sample, pmap)
    report.add(
        "path_rewrite",
        True,
        f"sample {sample} → {rewritten} (local_home={pmap.local_home})",
    )

    for hid in HARNESS_IDS:
        adapter = get_adapter(hid)
        roots = adapter.source_roots(cfg, home)
        present = [str(r) for r in roots if r.exists()]
        enabled = cfg.harnesses.get(hid, False)
        report.add(
            f"harness_{hid}",
            True,
            f"enabled={enabled} present={present or 'none'}",
        )

    dest = agents_dir(home)
    idle = dest / f"{IDLE_LABEL}.plist"
    nightly = dest / f"{NIGHTLY_LABEL}.plist"
    report.add(
        "launchd",
        True,
        f"idle={idle.exists()} nightly={nightly.exists()} dir={dest}",
    )

    state = read_state(vault) if vault.exists() else None
    if state:
        report.add(
            "vault_state",
            True,
            f"last_push={state.last_push_machine or '-'} pending_peers={state.pending_for_peers}",
        )
    return report
