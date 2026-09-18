"""Exclusive vault lock — only one machine owns live harnesses.

Supports three machine ids: ``air``, ``mini``, ``other``. Checkout / release /
bounce all read this file. There is no silent steal; ``doctor`` warns if a lock
looks stale, and ``checkout --force`` is the explicit override.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from twinkit_sync import HARNESS_IDS, LOCK_RELPATH, MACHINE_IDS


class LockError(Exception):
    def __init__(self, message: str, *, code: int = 2):
        super().__init__(message)
        self.code = code


@dataclass
class LockState:
    holder: str | None = None
    held_at: str | None = None
    harnesses: list[str] = field(default_factory=list)
    note: str = ""

    @property
    def held(self) -> bool:
        return bool(self.holder)

    def to_dict(self) -> dict[str, Any]:
        return {
            "holder": self.holder,
            "held_at": self.held_at,
            "harnesses": list(self.harnesses),
            "note": self.note,
        }


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def lock_path(vault: Path) -> Path:
    return vault / LOCK_RELPATH


def read_lock(vault: Path) -> LockState:
    path = lock_path(vault)
    if not path.is_file():
        return LockState()
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return LockState()
    holder = data.get("holder") or None
    if holder == "":
        holder = None
    harnesses = [h for h in (data.get("harnesses") or []) if h in HARNESS_IDS]
    return LockState(
        holder=holder,
        held_at=data.get("held_at") or None,
        harnesses=harnesses,
        note=str(data.get("note") or ""),
    )


def write_lock_atomic(vault: Path, state: LockState) -> Path:
    path = lock_path(vault)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state.to_dict(), indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(prefix=".lock.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(payload)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return path


def checkout(
    vault: Path,
    machine_id: str,
    *,
    harnesses: list[str] | None = None,
    force: bool = False,
    now: str | None = None,
) -> LockState:
    if machine_id not in MACHINE_IDS:
        raise LockError(f"unknown machine id {machine_id!r}")
    current = read_lock(vault)
    if current.holder and current.holder != machine_id and not force:
        raise LockError(
            f"vault lock held by {current.holder} since {current.held_at or '?'}; "
            f"{machine_id} cannot checkout (use --force only if that Mac is gone)"
        )
    state = LockState(
        holder=machine_id,
        held_at=now or _now_iso(),
        harnesses=list(harnesses or list(HARNESS_IDS)),
        note="exclusive live-harness owner",
    )
    write_lock_atomic(vault, state)
    return state


def release(
    vault: Path,
    machine_id: str,
    *,
    force: bool = False,
) -> LockState:
    current = read_lock(vault)
    if current.holder and current.holder != machine_id and not force:
        raise LockError(
            f"vault lock held by {current.holder}; {machine_id} cannot release"
        )
    state = LockState()
    write_lock_atomic(vault, state)
    return state


def holds_lock(vault: Path, machine_id: str) -> bool:
    return read_lock(vault).holder == machine_id


def require_holder(vault: Path, machine_id: str, *, action: str) -> LockState:
    current = read_lock(vault)
    if current.holder != machine_id:
        who = current.holder or "nobody"
        raise LockError(f"{action} requires exclusive lock (holder={who}, you={machine_id})")
    return current
