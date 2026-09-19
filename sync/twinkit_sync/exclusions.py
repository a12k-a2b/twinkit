"""Never-sync paths. TwinKit pack already skips credential filenames; Sync is stricter."""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath

# Exact basenames that must never enter the vault.
NEVER_NAMES = frozenset(
    {
        "auth.json",
        ".credentials.json",
        "credentials.json",
        "credentials",
        "cli_auth_credentials_store",
        ".env",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
    }
)

# Path substrings (posix, case-sensitive on the vault; compared lowercase too).
NEVER_SUBSTR = (
    "/.daylight/glass",
    ".daylight/glass/",
    "/.android/",
    "/.android",
    "keychain",
    "statsig",
    "telemetry",
    "gpu cache",
    "gpucache",
    "cacheddata",
    "code cache",
    "cache/",
    "/caches/",
    "crashpad",
    "indexeddb",
    "local storage",
    "service worker",
    "blob_storage",
)

# Filename / path fragment matches (lowercase).
NEVER_FRAGMENTS = (
    "credential",
    "auth.json",
    ".vscdb-wal",
    ".vscdb-shm",
    "-wal",
    "-shm",
    ".token",
    "token.json",
    ".pem",
    ".key",
    ".keystore",
    "secret",
)

# Opt-in only (huge / machine-local).
OPT_IN_NAMES = frozenset({"node_modules", "Cache", "CachedData", "GPUCache"})


def _posix(path: str | os.PathLike[str]) -> str:
    return PurePosixPath(str(path).replace("\\", "/")).as_posix()


def is_never_sync(rel_or_abs: str | os.PathLike[str], *, extra: list[str] | None = None) -> bool:
    """Return True if this path must not be packed or imported."""
    raw = _posix(rel_or_abs)
    name = Path(raw).name
    if name in NEVER_NAMES:
        return True
    lowered = raw.lower()
    if any(s in lowered for s in NEVER_SUBSTR):
        return True
    if any(frag in lowered or frag in name.lower() for frag in NEVER_FRAGMENTS):
        # Allow AGENTS.md / settings that merely mention "secret" in a folder? No —
        # fragment "secret" is conservative. Skip markdown titled *secret* too.
        if frag_is_false_positive(name, lowered):
            return False
        return True
    if extra:
        for item in extra:
            if item and item.lower() in lowered:
                return True
    return False


def frag_is_false_positive(name: str, lowered_path: str) -> bool:
    """Avoid excluding AGENTS.md just because a parent is named 'secrets-policy'."""
    # If the only hit is the word "secret" inside a .md/.txt note name, still exclude
    # files that look like dumps; allow TwinKit's own THREAT_MODEL-style docs in vault meta.
    if name in {"THREAT_MODEL.md", "SECRETS_REPORT.md", "HUMAN.md"}:
        return True
    if "secret" in name.lower() and name.lower().endswith((".md", ".txt")):
        return False
    # "secret" in a directory name should still exclude.
    return False


def rsync_exclude_args(extra: list[str] | None = None) -> list[str]:
    """Flags for rsync --exclude (best-effort; walk filter is authoritative)."""
    args: list[str] = []
    for name in sorted(NEVER_NAMES):
        args.extend(["--exclude", name])
    for frag in (
        "cache",
        "caches",
        "statsig",
        "telemetry",
        "*credentials*",
        "*token*",
        "*.key",
        "*.pem",
        "*.vscdb-wal",
        "*.vscdb-shm",
        "*-wal",
        "*-shm",
        ".env",
        ".env.*",
    ):
        args.extend(["--exclude", frag])
    if extra:
        for item in extra:
            args.extend(["--exclude", item])
    return args


def iter_packable_files(root: Path, *, extra: list[str] | None = None) -> list[Path]:
    """List files under root that are allowed to sync."""
    out: list[Path] = []
    if not root.is_dir():
        return out
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        # Prune excluded directories in-place.
        keep: list[str] = []
        for d in dirnames:
            rel = d if rel_dir == "." else f"{rel_dir}/{d}"
            if is_never_sync(rel, extra=extra) or d in OPT_IN_NAMES:
                continue
            keep.append(d)
        dirnames[:] = keep
        for fn in filenames:
            rel = fn if rel_dir == "." else f"{rel_dir}/{fn}"
            if is_never_sync(rel, extra=extra):
                continue
            out.append(Path(dirpath) / fn)
    return out
