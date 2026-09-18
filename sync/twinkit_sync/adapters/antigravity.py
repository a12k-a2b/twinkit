"""Antigravity / Gemini AG — cold conversations + brain.

Prior art: community rclone backup/restore (quit apps → copy
``~/.gemini/antigravity`` and ``antigravity-ide`` → restore). Never live-sync
Application Support SQLite while the IDE is open. Exclude secrets.
"""

from __future__ import annotations

import time
from pathlib import Path

from twinkit_sync.adapters.base import HarnessAdapter, PackResult, backup_tree, copy_filtered
from twinkit_sync.config import SyncConfig
from twinkit_sync.paths import PathMap, rewrite_tree


class AntigravityAdapter(HarnessAdapter):
    id = "ag"
    label = "Antigravity"

    def process_names(self) -> list[str]:
        return ["antigravity", "antigravity ide", "gemini"]

    def gemini_roots(self, cfg: SyncConfig, home: str | None) -> list[tuple[str, Path]]:
        base = self.expand_home("~/.gemini", cfg, home)
        return [
            ("antigravity", base / "antigravity"),
            ("antigravity-ide", base / "antigravity-ide"),
        ]

    def source_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [p for _, p in self.gemini_roots(cfg, home)]

    def session_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        out: list[Path] = []
        for _, root in self.gemini_roots(cfg, home):
            out.append(root / "conversations")
            out.append(root / "brain")
        return out

    def pack(
        self,
        cfg: SyncConfig,
        vault: Path,
        *,
        home: str | None = None,
        deep: bool = False,
        apps_running: bool = False,
    ) -> PackResult:
        dest_root = vault / self.vault_subdir()
        dest_root.mkdir(parents=True, exist_ok=True)
        extra = list(cfg.exclusions_extra)
        copied = 0
        skipped = 0
        notes: list[str] = []

        def pred(path: Path, rel: Path) -> bool:
            top = rel.parts[0] if rel.parts else ""
            if top in {"conversations", "brain"}:
                return True
            if path.name in {"config.json", "settings.json"} or path.suffix in {".md", ".json"}:
                return True
            if apps_running and path.suffix in {".vscdb", ".sqlite", ".db"}:
                return False
            return deep

        for label, src in self.gemini_roots(cfg, home):
            if not src.is_dir():
                notes.append(f"skip missing {label}")
                continue
            c, s = copy_filtered(src, dest_root / label, extra_exclude=extra, predicate=pred)
            copied += c
            skipped += s
            notes.append(f"packed {label}")

        (dest_root / "PACKED_AT").write_text(time.strftime("%Y-%m-%dT%H:%M:%SZ") + "\n")
        return PackResult(harness=self.id, files=copied, dest=str(dest_root), skipped=skipped, notes=notes)

    def unpack(
        self,
        cfg: SyncConfig,
        vault: Path,
        path_map: PathMap,
        *,
        home: str | None = None,
        backup_root: Path | None = None,
    ) -> PackResult:
        src_root = vault / self.vault_subdir()
        if not src_root.is_dir():
            return PackResult(harness=self.id, files=0, dest="", notes=["nothing in vault"])
        extra = list(cfg.exclusions_extra)
        copied = 0
        notes: list[str] = []
        for label, dest in self.gemini_roots(cfg, home):
            staged = src_root / label
            if not staged.is_dir():
                continue
            if backup_root:
                backup_tree(dest, backup_root / f"ag-{label}")
            c, _ = copy_filtered(staged, dest, extra_exclude=extra)
            copied += c
            rewrite_tree(dest, path_map, rename=True)
            notes.append(f"imported {label}")
        return PackResult(harness=self.id, files=copied, dest=str(src_root), notes=notes)
