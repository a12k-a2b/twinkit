"""Pack / unpack orchestration with TwinKit-style secret scan + META."""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

from twinkit_sync import META_RELPATH, __version__
from twinkit_sync.adapters import get_adapter
from twinkit_sync.adapters.base import PackResult
from twinkit_sync.config import SyncConfig
from twinkit_sync.exclusions import is_never_sync
from twinkit_sync.paths import PathMap, path_map_from_config

# Keep in sync with TwinKit pack / src/lib/twinkit/secrets.ts
SECRET_PATTERNS = [
    ("openai-sk", re.compile(r"sk-[A-Za-z0-9_-]{12,}")),
    ("stripe-live", re.compile(r"sk_live_[A-Za-z0-9]{10,}")),
    ("stripe-test", re.compile(r"sk_test_[A-Za-z0-9]{10,}")),
    ("ghp", re.compile(r"ghp_[A-Za-z0-9]{20,}")),
    ("gho", re.compile(r"gho_[A-Za-z0-9]{20,}")),
    ("ghu", re.compile(r"ghu_[A-Za-z0-9]{20,}")),
    ("github_pat", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("akia", re.compile(r"AKIA[0-9A-Z]{12,}")),
    ("slack", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("xai", re.compile(r"xai-[A-Za-z0-9_-]{10,}")),
    ("google-ai", re.compile(r"AIza[0-9A-Za-z_-]{20,}")),
    ("npm", re.compile(r"npm_[A-Za-z0-9]{36}")),
    ("pem", re.compile(r"-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----")),
    ("bearer", re.compile(r"Bearer [A-Za-z0-9._\-]{20,}")),
]


class SecretScanError(Exception):
    def __init__(self, hits: list[str]):
        super().__init__(f"secret scan: {len(hits)} hit(s)")
        self.hits = hits
        self.code = 2


def scan_vault_secrets(vault: Path) -> list[str]:
    hits: list[str] = []
    skip = {"SECRETS_REPORT.md", "THREAT_MODEL.md", "README.md"}
    for dirpath, dirnames, filenames in os.walk(vault):
        if ".git" in dirnames:
            dirnames.remove(".git")
        for fn in filenames:
            p = Path(dirpath) / fn
            rel = p.relative_to(vault).as_posix()
            if rel in skip or fn in skip:
                continue
            if is_never_sync(rel):
                hits.append(f"{rel}:0:never-sync-leaked")
                continue
            try:
                text = p.read_text(errors="replace")
            except OSError:
                continue
            if "\x00" in text[:2048]:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for name, rx in SECRET_PATTERNS:
                    if rx.search(line):
                        hits.append(f"{rel}:{i}:{name}")
    return hits


def write_secrets_report(vault: Path, hits: list[str]) -> Path:
    report = vault / "SECRETS_REPORT.md"
    lines = [
        "# SECRETS_REPORT",
        f"Scanned: {time.strftime('%Y-%m-%dT%H:%M:%S')}",
        "",
        "Hits are path:line:pattern-id only. Matching text is never stored.",
        "",
        "## Matches",
    ]
    if hits:
        lines.append(f"Found {len(hits)} hit(s):")
        lines.extend(hits[:200])
    else:
        lines.append("No pattern hits (best-effort, not a guarantee).")
    report.write_text("\n".join(lines) + "\n")
    return report


def pack_harnesses(
    cfg: SyncConfig,
    vault: Path,
    harnesses: list[str],
    *,
    home: str | None = None,
    deep: bool = False,
    running: dict[str, bool] | None = None,
) -> list[PackResult]:
    running = running or {}
    results: list[PackResult] = []
    for hid in harnesses:
        adapter = get_adapter(hid)
        results.append(
            adapter.pack(
                cfg,
                vault,
                home=home,
                deep=deep,
                apps_running=bool(running.get(hid)),
            )
        )
    meta = {
        "twinkit_sync": __version__,
        "packed_by": cfg.machine_id,
        "packed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source_home": cfg.local_home,
        "harnesses": harnesses,
        "deep": deep,
    }
    (vault / META_RELPATH).write_text(json.dumps(meta, indent=2) + "\n")
    hits = scan_vault_secrets(vault)
    write_secrets_report(vault, hits)
    if hits and os.environ.get("TWINKIT_ALLOW_SECRETS") != "1":
        raise SecretScanError(hits)
    return results


def unpack_harnesses(
    cfg: SyncConfig,
    vault: Path,
    harnesses: list[str],
    *,
    home: str | None = None,
    backup_root: Path | None = None,
    path_map: PathMap | None = None,
) -> list[PackResult]:
    pmap = path_map or path_map_from_config(cfg)
    results: list[PackResult] = []
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = backup_root or (Path(home or os.environ.get("HOME", ".")) / ".twinkit/sync/backups" / stamp)
    for hid in harnesses:
        adapter = get_adapter(hid)
        results.append(
            adapter.unpack(cfg, vault, pmap, home=home, backup_root=backup)
        )
    return results
