"""Git vault or local Syncthing folder.

Prefer a private git vault for 3 machines. Syncthing is a folder the daemon
already mirrors — we only write/read it (never live-sync SQLite while apps are
open; callers must bounce or confirm idle first).
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from twinkit_sync import STATE_RELPATH
from twinkit_sync.config import SyncConfig


class VaultError(Exception):
    def __init__(self, message: str, *, code: int = 1):
        super().__init__(message)
        self.code = code


@dataclass
class VaultState:
    last_push_machine: str | None = None
    last_push_at: str | None = None
    last_pull: dict[str, str] = field(default_factory=dict)
    pending_for_peers: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "last_push_machine": self.last_push_machine,
            "last_push_at": self.last_push_at,
            "last_pull": dict(self.last_pull),
            "pending_for_peers": self.pending_for_peers,
        }


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_state(vault: Path) -> VaultState:
    path = vault / STATE_RELPATH
    if not path.is_file():
        return VaultState()
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return VaultState()
    return VaultState(
        last_push_machine=data.get("last_push_machine") or None,
        last_push_at=data.get("last_push_at") or None,
        last_pull=dict(data.get("last_pull") or {}),
        pending_for_peers=bool(data.get("pending_for_peers")),
    )


def write_state(vault: Path, state: VaultState) -> Path:
    path = vault / STATE_RELPATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state.to_dict(), indent=2) + "\n")
    return path


def peer_needs_update(vault: Path, machine_id: str) -> bool:
    """True when this machine has unpublished local ownership work.

    Used by the scheduled bounce: if we hold the lock and peers are stale,
    bounce so we can pack → push.
    """
    state = read_state(vault)
    if state.pending_for_peers:
        return True
    if state.last_push_machine == machine_id:
        return False
    # We hold work that has never been pushed (or last push was someone else
    # before we checked out).
    return state.last_push_machine != machine_id


def mark_pushed(vault: Path, machine_id: str) -> VaultState:
    state = read_state(vault)
    state.last_push_machine = machine_id
    state.last_push_at = _now_iso()
    state.last_pull[machine_id] = state.last_push_at
    state.pending_for_peers = False
    write_state(vault, state)
    return state


def mark_pulled(vault: Path, machine_id: str) -> VaultState:
    state = read_state(vault)
    state.last_pull[machine_id] = _now_iso()
    write_state(vault, state)
    return state


def mark_local_dirty(vault: Path) -> VaultState:
    state = read_state(vault)
    state.pending_for_peers = True
    write_state(vault, state)
    return state


def git(argv: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    proc = subprocess.run(
        ["git", *argv],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if check and proc.returncode != 0:
        raise VaultError(f"git {' '.join(argv)} failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc


def is_git_repo(path: Path) -> bool:
    return (path / ".git").exists()


def init_vault(cfg: SyncConfig, *, home: str | None = None) -> Path:
    vault = cfg.vault_path(home)
    vault.mkdir(parents=True, exist_ok=True)
    (vault / ".twinkit").mkdir(parents=True, exist_ok=True)
    gitignore = vault / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(
            "\n".join(
                [
                    "# TwinKit Sync vault — never commit secrets",
                    "auth.json",
                    "*.key",
                    "*.pem",
                    ".env",
                    ".env.*",
                    "*.vscdb-wal",
                    "*.vscdb-shm",
                    "*-wal",
                    "*-shm",
                    "",
                ]
            )
        )
    readme = vault / "README.md"
    if not readme.exists():
        readme.write_text(
            "# TwinKit Sync vault\n\n"
            "Private cold-handoff store. Do not put auth.json, Keychain exports,\n"
            "glass locks, or adb state here.\n"
        )
    if cfg.vault.transport == "git" and not is_git_repo(vault):
        git(["init", "-b", "main"], cwd=vault, check=False)
        git(["init"], cwd=vault, check=False)
        if cfg.vault.remote:
            git(["remote", "add", "origin", cfg.vault.remote], cwd=vault, check=False)
        git(["add", "."], cwd=vault, check=False)
        git(
            ["-c", "user.email=twinkit@localhost", "-c", "user.name=TwinKit Sync",
             "commit", "-m", "twinkit-sync: init vault"],
            cwd=vault,
            check=False,
        )
    write_state(vault, read_state(vault))
    return vault


def vault_pull(cfg: SyncConfig, *, home: str | None = None) -> str:
    vault = cfg.vault_path(home)
    vault.mkdir(parents=True, exist_ok=True)
    if cfg.vault.transport != "git":
        # Syncthing: the folder is the transport.
        return "syncthing: local folder (daemon pulls)"
    if not is_git_repo(vault):
        if cfg.vault.remote:
            parent = vault.parent
            parent.mkdir(parents=True, exist_ok=True)
            if vault.exists() and not any(vault.iterdir()):
                vault.rmdir()
            git(["clone", cfg.vault.remote, str(vault)], cwd=parent)
            return f"cloned {cfg.vault.remote}"
        return "git vault has no remote; using local repo"
    git(["pull", "--rebase", "--autostash"], cwd=vault, check=False)
    return "git pull"


def vault_push(cfg: SyncConfig, *, message: str, home: str | None = None) -> str:
    vault = cfg.vault_path(home)
    if cfg.vault.transport != "git":
        return "syncthing: local folder (daemon pushes)"
    if not is_git_repo(vault):
        init_vault(cfg, home=home)
    git(["add", "-A"], cwd=vault)
    status = git(["status", "--porcelain"], cwd=vault)
    if not status.stdout.strip():
        if cfg.vault.remote:
            git(["push", "-u", "origin", "HEAD"], cwd=vault, check=False)
        return "git: nothing to commit"
    git(
        [
            "-c",
            "user.email=twinkit@localhost",
            "-c",
            "user.name=TwinKit Sync",
            "commit",
            "-m",
            message,
        ],
        cwd=vault,
    )
    if cfg.vault.remote:
        git(["push", "-u", "origin", "HEAD"], cwd=vault, check=False)
    return "git commit+push"
