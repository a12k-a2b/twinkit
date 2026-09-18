"""Claude Code adapter — ``~/.claude`` and ``~/.claude-b`` dual profiles.

Prior art: claudesync / ccsync / claude-sync (allowlists, Syncthing,
**root-relative project identity** instead of absolute paths). Credentials
stay machine-local; re-login per Mac.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from twinkit_sync.adapters.base import (
    HarnessAdapter,
    PackResult,
    backup_tree,
    copy_filtered,
    write_identity,
)
from twinkit_sync.config import SyncConfig
from twinkit_sync.paths import PathMap, identity_record, path_map_from_config, rewrite_tree, unescape_abs


class ClaudeAdapter(HarnessAdapter):
    id = "claude"
    label = "Claude Code"

    def process_names(self) -> list[str]:
        return ["claude"]

    def profile_homes(self, cfg: SyncConfig, home: str | None) -> list[tuple[str, Path]]:
        out: list[tuple[str, Path]] = []
        for raw in cfg.claude_homes:
            path = self.expand_home(raw, cfg, home)
            label = path.name  # .claude or .claude-b
            out.append((label, path))
        return out

    def source_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [p for _, p in self.profile_homes(cfg, home)]

    def session_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [p / "projects" for _, p in self.profile_homes(cfg, home)]

    def pack(
        self,
        cfg: SyncConfig,
        vault: Path,
        *,
        home: str | None = None,
        deep: bool = False,
        apps_running: bool = False,
    ) -> PackResult:
        extra = list(cfg.exclusions_extra)
        copied = 0
        skipped = 0
        notes: list[str] = []
        pmap = path_map_from_config(cfg)
        dest_root = vault / self.vault_subdir()
        dest_root.mkdir(parents=True, exist_ok=True)
        all_records: list[dict] = []

        for label, src in self.profile_homes(cfg, home):
            if not src.is_dir():
                notes.append(f"skip missing {label}")
                continue
            dest = dest_root / label
            c, s = copy_filtered(src, dest, extra_exclude=extra)
            copied += c
            skipped += s
            projects = src / "projects"
            if projects.is_dir():
                for child in projects.iterdir():
                    if not child.is_dir():
                        continue
                    abs_guess = unescape_abs(child.name) if child.name.startswith("-") else child.name
                    rec = identity_record(
                        kind="claude-project",
                        abs_path=abs_guess,
                        path_map=pmap,
                        escaped_dir=child.name,
                    )
                    rec["profile"] = label
                    all_records.append(rec)
            notes.append(f"packed {label}")

        write_identity(dest_root, all_records)
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
        identity_path = src_root / "project-identity.json"
        identities = []
        if identity_path.is_file():
            try:
                identities = json.loads(identity_path.read_text())
            except json.JSONDecodeError:
                identities = []

        for label, dest in self.profile_homes(cfg, home):
            staged = src_root / label
            if not staged.is_dir():
                continue
            if backup_root:
                backup_tree(dest, backup_root / f"claude-{label}")
            c, _ = copy_filtered(staged, dest, extra_exclude=extra)
            copied += c
            projects = dest / "projects"
            if projects.is_dir():
                rewrite_tree(projects, path_map, rename=True)
            notes.append(f"imported {label} with path rewrite + root-relative identity")

        if identities:
            (self.expand_home("~/.twinkit/sync", cfg, home) / "claude-identity.json").parent.mkdir(
                parents=True, exist_ok=True
            )
        return PackResult(harness=self.id, files=copied, dest=str(src_root), notes=notes)
