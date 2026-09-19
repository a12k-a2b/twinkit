from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from twinkit_sync.config import SyncConfig, expand
from twinkit_sync.idle import IdleProbes
from twinkit_sync.paths import PathMap


@dataclass
class PackResult:
    harness: str
    files: int
    dest: str
    skipped: int = 0
    notes: list[str] | None = None


class HarnessAdapter:
    id: str = ""
    label: str = ""

    def source_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        raise NotImplementedError

    def session_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return self.source_roots(cfg, home)

    def vault_subdir(self) -> str:
        return self.id

    def pack(
        self,
        cfg: SyncConfig,
        vault: Path,
        *,
        home: str | None = None,
        deep: bool = False,
        apps_running: bool = False,
    ) -> PackResult:
        raise NotImplementedError

    def unpack(
        self,
        cfg: SyncConfig,
        vault: Path,
        path_map: PathMap,
        *,
        home: str | None = None,
        backup_root: Path | None = None,
    ) -> PackResult:
        raise NotImplementedError

    def process_names(self) -> list[str]:
        return [self.id]

    def idle_probes_hint(self, cfg: SyncConfig, home: str | None = None) -> IdleProbes:
        return IdleProbes()

    def expand_home(self, path: str, cfg: SyncConfig, home: str | None) -> Path:
        return expand(path, home or cfg.local_home)


def copy_filtered(
    src_root: Path,
    dest_root: Path,
    *,
    extra_exclude: list[str] | None = None,
    predicate=None,
) -> tuple[int, int]:
    """Copy allowlisted files. Returns (copied, skipped)."""
    from twinkit_sync.exclusions import iter_packable_files, is_never_sync

    copied = 0
    skipped = 0
    if not src_root.exists():
        return 0, 0
    dest_root.mkdir(parents=True, exist_ok=True)
    files = iter_packable_files(src_root, extra=extra_exclude)
    for src in files:
        rel = src.relative_to(src_root)
        if predicate and not predicate(src, rel):
            skipped += 1
            continue
        if is_never_sync(rel.as_posix(), extra=extra_exclude):
            skipped += 1
            continue
        dest = dest_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(src.read_bytes())
        copied += 1
    return copied, skipped


def backup_tree(src: Path, backup_root: Path) -> None:
    if not src.exists():
        return
    dest = backup_root / src.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_file():
        dest.write_bytes(src.read_bytes())
        return
    for path in src.rglob("*"):
        if path.is_file():
            rel = path.relative_to(src)
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())


def write_identity(dest_root: Path, records: Iterable[dict]) -> None:
    import json

    path = dest_root / "project-identity.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(list(records), indent=2) + "\n")
