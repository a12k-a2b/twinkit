"""Rewrite absolute + escaped home prefixes on import.

Mini ``/Users/anjanmacmini`` vs Air ``/Users/anjan``. Claude stores projects as
``~/.claude/projects/-Users-anjan-Projects-foo`` (slashes → dashes). Cursor and
Antigravity indexes embed absolute paths in JSON/JSONL/SQLite dumps.

Canon roots (e.g. ``/Users/Shared/Projects``) are left alone — they already
match across machines.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote, unquote

TEXT_SUFFIXES = frozenset(
    {
        ".json",
        ".jsonl",
        ".md",
        ".txt",
        ".toml",
        ".yml",
        ".yaml",
        ".xml",
        ".html",
        ".csv",
        ".log",
        ".ini",
        ".conf",
        ".cfg",
        ".js",
        ".ts",
        ".mjs",
        ".cjs",
        ".py",
        ".sh",
        ".zsh",
    }
)

# Claude / Cursor escaped-path alphabet: / → -
_ESCAPED_SLASH = "-"


@dataclass
class PathMap:
    """machine id → home prefix, plus optional canon roots."""

    local_home: str
    peer_homes: list[str] = field(default_factory=list)
    canon_roots: list[str] = field(default_factory=list)
    machine_homes: dict[str, str] = field(default_factory=dict)

    def all_foreign_homes(self) -> list[str]:
        homes = [h.rstrip("/") for h in self.peer_homes if h]
        local = self.local_home.rstrip("/")
        return sorted({h for h in homes if h and h != local}, key=len, reverse=True)


def escape_abs(abs_path: str) -> str:
    """Claude-style: ``/Users/anjan/Projects/foo`` → ``-Users-anjan-Projects-foo``."""
    p = abs_path.replace("\\", "/")
    if not p.startswith("/"):
        p = "/" + p
    return p.replace("/", _ESCAPED_SLASH)


def unescape_abs(escaped: str) -> str:
    if not escaped.startswith("-"):
        return escaped
    return escaped.replace(_ESCAPED_SLASH, "/")


def slash_escape(abs_path: str) -> str:
    return abs_path.replace("/", r"\/")


def url_encode_path(abs_path: str) -> str:
    return quote(abs_path, safe="")


# Next-char set that means "this was a path prefix, not /Users/anjan-inside-anjanmacmini".
_PATH_BOUNDARIES = frozenset("/-\\\"'\t\n\r ,}])%")


def replace_bounded(text: str, src: str, dst: str) -> str:
    """Replace ``src`` only when the next character is a path boundary (or EOS).

    Required because Air ``/Users/anjan`` is a prefix of Mini
    ``/Users/anjanmacmini``. A naive ``str.replace`` turns Mini paths into
    ``/Users/anjanmacminiminimacmini``.
    """
    if not src or src == dst:
        return text
    out: list[str] = []
    i = 0
    n = len(src)
    while True:
        j = text.find(src, i)
        if j < 0:
            out.append(text[i:])
            break
        end = j + n
        nxt = text[end : end + 1]
        if nxt and nxt not in _PATH_BOUNDARIES:
            out.append(text[i:end])
            i = end
            continue
        out.append(text[i:j])
        out.append(dst)
        i = end
    return "".join(out)


def rewrite_text(text: str, path_map: PathMap) -> str:
    """Replace foreign home prefixes with the local home in a text blob."""
    local = path_map.local_home.rstrip("/")
    out = text
    for foreign in path_map.all_foreign_homes():
        if not foreign or foreign == local:
            continue
        # Longest-first already. Apply several encodings.
        variants = (
            (foreign, local),
            (escape_abs(foreign), escape_abs(local)),
            (slash_escape(foreign), slash_escape(local)),
            (url_encode_path(foreign), url_encode_path(local)),
            (unquote(foreign), unquote(local)),  # no-op if not encoded
        )
        for src, dst in variants:
            if src and src != dst:
                out = replace_bounded(out, src, dst)
    return out


def rewrite_filename(name: str, path_map: PathMap) -> str:
    return rewrite_text(name, path_map)


def root_relative(abs_path: str, homes: list[str], canon_roots: list[str] | None = None) -> str:
    """Strip a known home or canon root; return a portable project identity."""
    norm = abs_path.replace("\\", "/").rstrip("/")
    candidates = [c.rstrip("/") for c in (canon_roots or []) + list(homes) if c]
    candidates.sort(key=len, reverse=True)
    for root in candidates:
        if norm == root:
            return ""
        prefix = root + "/"
        if norm.startswith(prefix):
            return norm[len(prefix) :]
    if norm.startswith("/"):
        # last resort: drop first two segments (/Users/name)
        parts = norm.strip("/").split("/")
        if len(parts) >= 3 and parts[0] == "Users":
            return "/".join(parts[2:])
    return norm.lstrip("/")


def _under_root(abs_path: str, root: str) -> bool:
    norm = abs_path.rstrip("/")
    base = root.rstrip("/")
    return norm == base or norm.startswith(base + "/")


def resolve_identity(
    *,
    root_rel: str,
    path_map: PathMap,
    source_abs: str | None = None,
    prefer_canon: bool = False,
) -> str:
    """Pick the destination absolute path for a packed project.

    Order: source already under a canon root → keep that canon + relative;
    else local home + relative; else rewritten source.
    """
    rel = root_rel.lstrip("/")
    if source_abs:
        for canon in path_map.canon_roots:
            if canon and _under_root(source_abs, canon):
                return f"{canon.rstrip('/')}/{rel}" if rel else canon.rstrip("/")
    if prefer_canon and path_map.canon_roots:
        canon = path_map.canon_roots[0].rstrip("/")
        return f"{canon}/{rel}" if rel else canon
    local = path_map.local_home.rstrip("/")
    if rel:
        return f"{local}/{rel}"
    if source_abs:
        return rewrite_text(source_abs, path_map)
    return local


def is_probably_text(path: Path, sample: bytes | None = None) -> bool:
    if path.suffix.lower() in TEXT_SUFFIXES:
        return True
    if path.suffix.lower() in {".vscdb", ".sqlite", ".db", ".pb", ".bin", ".png", ".jpg", ".zip"}:
        return False
    blob = sample
    if blob is None:
        try:
            blob = path.read_bytes()[:2048]
        except OSError:
            return False
    if b"\x00" in blob:
        return False
    return True


def rewrite_file_inplace(path: Path, path_map: PathMap) -> bool:
    """Rewrite a text file. Returns True if contents changed."""
    try:
        raw = path.read_bytes()
    except OSError:
        return False
    if not is_probably_text(path, raw):
        return False
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")
    new = rewrite_text(text, path_map)
    if new == text:
        return False
    path.write_text(new)
    return True


def rewrite_tree(
    root: Path,
    path_map: PathMap,
    *,
    rename: bool = True,
) -> dict[str, int]:
    """Rewrite file contents and optionally rename path-encoded directories.

    Renames deepest paths first so Claude ``projects/-Users-…`` folders move
    in one pass.
    """
    stats = {"files": 0, "renamed": 0}
    if not root.exists():
        return stats
    # Contents first.
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            p = Path(dirpath) / fn
            if rewrite_file_inplace(p, path_map):
                stats["files"] += 1
    if not rename:
        return stats
    # Collect dirs + files whose names contain a foreign home encoding.
    to_rename: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        for name in filenames + dirnames:
            p = Path(dirpath) / name
            if rewrite_filename(name, path_map) != name:
                to_rename.append(p)
    # Deepest first.
    to_rename.sort(key=lambda p: len(p.parts), reverse=True)
    for src in to_rename:
        if not src.exists():
            continue
        dest_name = rewrite_filename(src.name, path_map)
        dest = src.with_name(dest_name)
        if dest == src:
            continue
        if dest.exists():
            # Merge directories; leave files if dest already there.
            if src.is_dir() and dest.is_dir():
                _merge_dirs(src, dest)
                stats["renamed"] += 1
            continue
        src.rename(dest)
        stats["renamed"] += 1
    return stats


def _merge_dirs(src: Path, dest: Path) -> None:
    for item in src.iterdir():
        target = dest / item.name
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            _merge_dirs(item, target)
        elif not target.exists():
            item.rename(target)
    # Best-effort cleanup.
    try:
        src.rmdir()
    except OSError:
        pass


def identity_record(
    *,
    kind: str,
    abs_path: str,
    path_map: PathMap,
    escaped_dir: str | None = None,
) -> dict[str, str | None]:
    homes = [path_map.local_home, *path_map.all_foreign_homes()]
    rel = root_relative(abs_path, homes, path_map.canon_roots)
    return {
        "kind": kind,
        "absolute": abs_path,
        "escaped_dir": escaped_dir or escape_abs(abs_path),
        "root_relative": rel,
        "resolved": resolve_identity(root_rel=rel, path_map=path_map, source_abs=abs_path),
    }


def path_map_from_config(cfg) -> PathMap:
    return PathMap(
        local_home=cfg.local_home,
        peer_homes=cfg.peer_homes(),
        canon_roots=list(cfg.canon_roots),
        machine_homes={mid: m.home for mid, m in cfg.machines.items()},
    )


# Used by tests / doctor for a quick sanity sample.
JSON_PATH_RE = re.compile(r'(/Users/[^"\\s]+)')
