"""Codex adapter — cold ``~/.codex`` handoff, backup before overwrite.

Prior art: codexSync / codex-session-tui. Sessions can be huge (~14GB);
default is ``sessions: last_N_days`` (30). Never pack ``auth.json``.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from twinkit_sync.adapters.base import HarnessAdapter, PackResult, backup_tree, copy_filtered
from twinkit_sync.config import SyncConfig
from twinkit_sync.paths import PathMap, rewrite_tree


class CodexAdapter(HarnessAdapter):
    id = "codex"
    label = "Codex"

    def process_names(self) -> list[str]:
        return ["codex"]

    def _home(self, cfg: SyncConfig, home: str | None) -> Path:
        return self.expand_home("~/.codex", cfg, home)

    def source_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [self._home(cfg, home)]

    def session_roots(self, cfg: SyncConfig, home: str | None = None) -> list[Path]:
        return [self._home(cfg, home) / "sessions"]

    def pack(
        self,
        cfg: SyncConfig,
        vault: Path,
        *,
        home: str | None = None,
        deep: bool = False,
        apps_running: bool = False,
    ) -> PackResult:
        src = self._home(cfg, home)
        dest = vault / self.vault_subdir()
        dest.mkdir(parents=True, exist_ok=True)
        extra = list(cfg.exclusions_extra)
        cutoff = None
        notes: list[str] = []
        if not deep:
            days = max(1, int(cfg.sessions_last_n_days))
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            notes.append(f"sessions: last_{days}_days")
        else:
            notes.append("sessions: deep (all)")

        def pred(path: Path, rel: Path) -> bool:
            posix = rel.as_posix()
            if posix == "auth.json" or path.name == "auth.json":
                return False
            if rel.parts and rel.parts[0] == "sessions" and cutoff is not None:
                return _session_recent(rel, path, cutoff)
            # Config, AGENTS.md, history, non-secret knobs.
            if rel.parts and rel.parts[0] in {"sessions"}:
                return True
            if path.suffix.lower() in {".toml", ".md", ".jsonl", ".json"}:
                return True
            return path.name in {"config.toml", "AGENTS.md", "AGENTS.override.md", "history.jsonl"}

        copied, skipped = copy_filtered(src, dest, extra_exclude=extra, predicate=pred)
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
        dest = self._home(cfg, home)
        if not src.is_dir():
            return PackResult(harness=self.id, files=0, dest=str(dest), notes=["nothing in vault"])
        if backup_root:
            backup_tree(dest, backup_root / "codex")
        extra = list(cfg.exclusions_extra)
        copied, skipped = copy_filtered(src, dest, extra_exclude=extra)
        rewrite_tree(dest, path_map, rename=False)
        return PackResult(harness=self.id, files=copied, dest=str(dest), skipped=skipped, notes=["backup-before-overwrite"])


def _session_recent(rel: Path, path: Path, cutoff: datetime) -> bool:
    """Codex layout: sessions/YYYY/MM/DD/rollout-*.jsonl — also honor mtime."""
    parts = rel.parts
    # sessions / YYYY / MM / DD / file
    if len(parts) >= 4:
        try:
            y, m, d = int(parts[1]), int(parts[2]), int(parts[3])
            day = datetime(y, m, d, tzinfo=timezone.utc)
            return day >= cutoff.replace(hour=0, minute=0, second=0, microsecond=0)
        except ValueError:
            pass
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        return mtime >= cutoff
    except OSError:
        return False
