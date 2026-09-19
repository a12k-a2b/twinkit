"""Machine + vault config. JSON, zero third-party deps."""

from __future__ import annotations

import json
import os
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from twinkit_sync import (
    DEFAULT_QUIET_MINUTES,
    DEFAULT_SESSIONS_LAST_N_DAYS,
    HARNESS_IDS,
    MACHINE_IDS,
)

CONFIG_VERSION = 1


def expand(path: str, home: str | None = None) -> Path:
    if home is None:
        home = os.environ.get("HOME", str(Path.home()))
    if path.startswith("~/"):
        return Path(home) / path[2:]
    return Path(os.path.expanduser(path))


def default_sync_root(home: str | None = None) -> Path:
    override = os.environ.get("TWINKIT_SYNC_ROOT")
    if override:
        return Path(override)
    return expand("~/.twinkit/sync", home)


def default_config_path(home: str | None = None) -> Path:
    override = os.environ.get("TWINKIT_SYNC_CONFIG")
    if override:
        return Path(override)
    return default_sync_root(home) / "config.json"


def guess_machine_id(hostname: str | None = None, home: str | None = None) -> str:
    env = os.environ.get("TWINKIT_MACHINE_ID", "").strip().lower()
    if env in MACHINE_IDS:
        return env
    host = (hostname or socket.gethostname() or "").lower()
    home_path = (home or os.environ.get("HOME", "")).lower()
    if "mini" in host or "anjanmacmini" in home_path:
        return "mini"
    if "air" in host or home_path.endswith("/anjan"):
        return "air"
    return "other"


def default_homes() -> dict[str, str]:
    return {
        "air": "/Users/anjan",
        "mini": "/Users/anjanmacmini",
        "other": "/Users/Shared/twin-other",
    }


@dataclass
class MachineMap:
    id: str
    home: str
    label: str = ""


@dataclass
class VaultConfig:
    transport: str = "git"  # git | syncthing
    path: str = "~/.twinkit/sync/vault"
    remote: str = ""


@dataclass
class SyncConfig:
    version: int = CONFIG_VERSION
    machine_id: str = "air"
    machines: dict[str, MachineMap] = field(default_factory=dict)
    canon_roots: list[str] = field(default_factory=lambda: ["/Users/Shared/Projects"])
    vault: VaultConfig = field(default_factory=VaultConfig)
    harnesses: dict[str, bool] = field(
        default_factory=lambda: {h: True for h in HARNESS_IDS}
    )
    claude_homes: list[str] = field(default_factory=lambda: ["~/.claude", "~/.claude-b"])
    sessions_last_n_days: int = DEFAULT_SESSIONS_LAST_N_DAYS
    quiet_minutes: int = DEFAULT_QUIET_MINUTES
    exclusions_extra: list[str] = field(default_factory=list)
    notify: bool = True

    @property
    def local_home(self) -> str:
        m = self.machines.get(self.machine_id)
        if m:
            return m.home.rstrip("/")
        return os.environ.get("HOME", "").rstrip("/")

    def home_for(self, machine_id: str) -> str:
        m = self.machines.get(machine_id)
        return (m.home if m else "").rstrip("/")

    def enabled_harnesses(self) -> list[str]:
        return [h for h in HARNESS_IDS if self.harnesses.get(h, False)]

    def peer_homes(self) -> list[str]:
        local = self.local_home
        return [m.home.rstrip("/") for m in self.machines.values() if m.home.rstrip("/") != local]

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "machine_id": self.machine_id,
            "machines": {
                mid: {"home": m.home, "label": m.label} for mid, m in self.machines.items()
            },
            "canon_roots": list(self.canon_roots),
            "vault": {
                "transport": self.vault.transport,
                "path": self.vault.path,
                "remote": self.vault.remote,
            },
            "harnesses": dict(self.harnesses),
            "claude_homes": list(self.claude_homes),
            "sessions_last_n_days": self.sessions_last_n_days,
            "quiet_minutes": self.quiet_minutes,
            "exclusions_extra": list(self.exclusions_extra),
            "notify": self.notify,
        }

    def vault_path(self, home: str | None = None) -> Path:
        override = os.environ.get("TWINKIT_SYNC_VAULT")
        if override:
            return Path(override)
        return expand(self.vault.path, home)


def load_config(path: Path | None = None, home: str | None = None) -> SyncConfig:
    cfg_path = path or default_config_path(home)
    data = json.loads(cfg_path.read_text())
    return config_from_dict(data)


def config_from_dict(data: dict[str, Any]) -> SyncConfig:
    machines: dict[str, MachineMap] = {}
    raw_machines = data.get("machines") or {}
    for mid, info in raw_machines.items():
        if isinstance(info, str):
            machines[mid] = MachineMap(id=mid, home=info, label=mid)
        else:
            machines[mid] = MachineMap(
                id=mid,
                home=str(info.get("home", "")),
                label=str(info.get("label") or mid),
            )
    if not machines:
        for mid, home in default_homes().items():
            machines[mid] = MachineMap(id=mid, home=home, label=mid)
    vault_raw = data.get("vault") or {}
    harnesses = {h: True for h in HARNESS_IDS}
    harnesses.update({k: bool(v) for k, v in (data.get("harnesses") or {}).items() if k in HARNESS_IDS})
    return SyncConfig(
        version=int(data.get("version") or CONFIG_VERSION),
        machine_id=str(data.get("machine_id") or "air"),
        machines=machines,
        canon_roots=list(data.get("canon_roots") or ["/Users/Shared/Projects"]),
        vault=VaultConfig(
            transport=str(vault_raw.get("transport") or "git"),
            path=str(vault_raw.get("path") or "~/.twinkit/sync/vault"),
            remote=str(vault_raw.get("remote") or ""),
        ),
        harnesses=harnesses,
        claude_homes=list(data.get("claude_homes") or ["~/.claude", "~/.claude-b"]),
        sessions_last_n_days=int(data.get("sessions_last_n_days") or DEFAULT_SESSIONS_LAST_N_DAYS),
        quiet_minutes=int(data.get("quiet_minutes") or DEFAULT_QUIET_MINUTES),
        exclusions_extra=list(data.get("exclusions_extra") or []),
        notify=bool(data.get("notify", True)),
    )


def save_config(cfg: SyncConfig, path: Path | None = None, home: str | None = None) -> Path:
    cfg_path = path or default_config_path(home)
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text(json.dumps(cfg.to_dict(), indent=2) + "\n")
    return cfg_path


def init_config(
    *,
    machine_id: str | None = None,
    home: str | None = None,
    transport: str = "git",
    vault: str | None = None,
    remote: str = "",
    air_home: str | None = None,
    mini_home: str | None = None,
    other_home: str | None = None,
    path: Path | None = None,
) -> SyncConfig:
    mid = machine_id or guess_machine_id(home=home)
    if mid not in MACHINE_IDS:
        raise ValueError(f"machine_id must be one of {MACHINE_IDS}, got {mid!r}")
    if transport not in {"git", "syncthing"}:
        raise ValueError("transport must be 'git' or 'syncthing'")
    homes = default_homes()
    if air_home:
        homes["air"] = air_home
    if mini_home:
        homes["mini"] = mini_home
    if other_home:
        homes["other"] = other_home
    # If this machine's home isn't the canned one, record the real $HOME.
    real_home = (home or os.environ.get("HOME") or homes.get(mid, "")).rstrip("/")
    if real_home:
        homes[mid] = real_home
    machines = {
        k: MachineMap(
            id=k,
            home=v,
            label={"air": "MacBook Air", "mini": "Mac mini", "other": "3rd Mac"}[k],
        )
        for k, v in homes.items()
    }
    cfg = SyncConfig(
        machine_id=mid,
        machines=machines,
        vault=VaultConfig(
            transport=transport,
            path=vault or str(default_sync_root(home) / "vault"),
            remote=remote,
        ),
    )
    save_config(cfg, path=path, home=home)
    return cfg
