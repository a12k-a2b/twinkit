"""Cursor adapter — transcripts + skills; never live-sync SQLite while open.

Prior art: cursaves (export/import via snapshots, path rewrite, refuse writes
while Cursor is running). We reimplement under TwinKit's MIT license.
"""

from __future__ import annotations

import time
from pathlib import Path

from twinkit_sync.adapters.base import HarnessAdapter, PackResult, backup_tree, copy_filtered
from twinkit_sync.config import SyncConfig
from twinkit_sync.paths import PathMap, identity_record, rewrite_tree


class CursorAdapter(HarnessAdapter):
    id = "cursor"
    label = "Cursor"

    def process_names(self) -> list[str]:
        return ["cursor", "cursor helper"]

    def _dot_cursor(self, cfg: SyncConfig, home: str | None) -> Path:
        return self.expand_home("~/.cursor", cfg, home)

    def _app_support(self, cfg: SyncConfig, home: str | None) -> Path:
        return self.expand_home("~/Library/Application Support/Cursor/User", cfg, home)

    def source_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [self._dot_cursor(cfg, home), self._app_support(cfg, home)]

    def session_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        roots = []
        projects = self._dot_cursor(cfg, home) / "projects"
        if projects.is_dir():
            roots.append(projects)
        return roots

    def pack(
        self,
        cfg: SyncConfig,
        vault: Path,
        *,
        home: str | None = None,
        deep: bool = False,
        apps_running: bool = False,
    ) -> PackResult:
        dest = vault / self.vault_subdir()
        dest.mkdir(parents=True, exist_ok=True)
        copied = 0
        skipped = 0
        notes: list[str] = []
        dot = self._dot_cursor(cfg, home)
        extra = list(cfg.exclusions_extra)

        def allow_dot(src: Path, rel: Path) -> bool:
            parts = rel.parts
            if not parts:
                return False
            top = parts[0]
            # skills, commands, mcp.json, agent transcripts
            if top in {"skills", "commands"}:
                return True
            if rel.as_posix() == "mcp.json":
                return True
            if top == "projects" and "agent-transcripts" in parts:
                return True
            return False

        if dot.is_dir():
            c, s = copy_filtered(dot, dest / "dot-cursor", extra_exclude=extra, predicate=allow_dot)
            copied += c
            skipped += s

        user = self._app_support(cfg, home)
        if user.is_dir() and not apps_running:
            for name in ("settings.json", "keybindings.json"):
                src = user / name
                if src.is_file():
                    target = dest / "user" / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(src.read_bytes())
                    copied += 1
            snippets = user / "snippets"
            if snippets.is_dir():
                c, s = copy_filtered(snippets, dest / "user" / "snippets", extra_exclude=extra)
                copied += c
                skipped += s
            if deep:
                # Cold copy of global chat DB only when Cursor is quit.
                db = user / "globalStorage" / "state.vscdb"
                if db.is_file():
                    target = dest / "user" / "globalStorage" / "state.vscdb"
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(db.read_bytes())
                    copied += 1
                    notes.append("deep: copied state.vscdb (Cursor was not running)")
        elif apps_running:
            notes.append("skipped Application Support (Cursor running — no live SQLite)")

        records = []
        projects = dest / "dot-cursor" / "projects"
        if projects.is_dir():
            from twinkit_sync.paths import path_map_from_config, unescape_abs

            pmap = path_map_from_config(cfg)
            for child in projects.iterdir():
                if child.is_dir():
                    abs_guess = unescape_abs(child.name) if child.name.startswith("-") else ""
                    records.append(
                        identity_record(
                            kind="cursor-project",
                            abs_path=abs_guess or child.name,
                            path_map=pmap,
                            escaped_dir=child.name,
                        )
                    )
        if records:
            from twinkit_sync.adapters.base import write_identity

            write_identity(dest, records)
        (dest / "PACKED_AT").write_text(time.strftime("%Y-%m-%dT%H:%M:%SZ") + "\n")
        return PackResult(harness=self.id, files=copied, dest=str(dest), skipped=skipped, notes=notes)

    def unpack(
        self,
        cfg: SyncConfig,
        vault: Path,
        path_map: PathMap,
        *,
        home: str | None = None,
        backup_root: Path | None = None,
    ) -> PackResult:
        src = vault / self.vault_subdir()
        if not src.is_dir():
            return PackResult(harness=self.id, files=0, dest="", notes=["nothing in vault"])
        copied = 0
        notes: list[str] = []
        extra = list(cfg.exclusions_extra)

        staged = src / "dot-cursor"
        if staged.is_dir():
            dest = self._dot_cursor(cfg, home)
            if backup_root:
                backup_tree(dest, backup_root / "cursor-dot")
            c, _ = copy_filtered(staged, dest, extra_exclude=extra)
            copied += c
            rewrite_tree(dest / "projects", path_map, rename=True)
            notes.append("rewrote ~/.cursor/projects path encodings")

        user_src = src / "user"
        if user_src.is_dir():
            dest_user = self._app_support(cfg, home)
            if backup_root:
                backup_tree(dest_user, backup_root / "cursor-user")
            c, _ = copy_filtered(user_src, dest_user, extra_exclude=extra)
            copied += c
            rewrite_tree(dest_user, path_map, rename=False)

        return PackResult(harness=self.id, files=copied, dest=str(self._dot_cursor(cfg, home)), notes=notes)
