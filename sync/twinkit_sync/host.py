"""Host process / mtime probes. Overridable in tests via HostFacts."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from twinkit_sync.adapters import get_adapter
from twinkit_sync.config import SyncConfig
from twinkit_sync.idle import IdleProbes, IdleReport, ProcInfo, collect_session_mtimes, detect_idle


def list_processes() -> list[ProcInfo]:
    """Best-effort process table (ps). Empty on failure.

    Linux CI is not a TwinKit desk — ignore the host process table unless
    ``TWINKIT_SYNC_USE_HOST_PROCS=1``. macOS uses real probes. Tests inject
    ``HostFacts`` instead.
    """
    if os.environ.get("TWINKIT_SYNC_STUB_PROCS") == "1":
        return []
    if sys.platform != "darwin" and os.environ.get("TWINKIT_SYNC_USE_HOST_PROCS") != "1":
        return []
    if not shutil.which("ps"):
        return []
    proc = subprocess.run(
        ["ps", "-ax", "-o", "pid=,ppid=,pcpu=,comm="],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return []
    out: list[ProcInfo] = []
    for line in proc.stdout.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) < 4:
            continue
        try:
            pid = int(parts[0])
            ppid = int(parts[1])
            cpu = float(parts[2])
        except ValueError:
            continue
        name = Path(parts[3]).name
        out.append(ProcInfo(pid=pid, name=name, cmdline=parts[3], cpu=cpu, parent_pid=ppid))
    # Second pass with args if available.
    args_proc = subprocess.run(
        ["ps", "-ax", "-o", "pid=,args="],
        capture_output=True,
        text=True,
        check=False,
    )
    if args_proc.returncode == 0:
        by_pid = {p.pid: p for p in out}
        for line in args_proc.stdout.splitlines():
            parts = line.strip().split(None, 1)
            if len(parts) == 2:
                try:
                    pid = int(parts[0])
                except ValueError:
                    continue
                if pid in by_pid:
                    by_pid[pid].cmdline = parts[1]
    return out


@dataclass
class HostFacts:
    processes: list[ProcInfo] | None = None
    probes_by_harness: dict[str, IdleProbes] = field(default_factory=dict)
    now: float | None = None

    def probes_for(self, harness: str, cfg: SyncConfig, home: str | None = None) -> IdleProbes:
        if harness in self.probes_by_harness:
            return self.probes_by_harness[harness]
        adapter = get_adapter(harness)
        procs = self.processes if self.processes is not None else list_processes()
        mtimes = collect_session_mtimes(adapter.session_roots(cfg, home))
        return IdleProbes(now=self.now, processes=procs, session_mtimes=mtimes)


def idle_reports(
    cfg: SyncConfig,
    harnesses: list[str],
    host: HostFacts | None = None,
    home: str | None = None,
) -> list[IdleReport]:
    facts = host or HostFacts()
    reports: list[IdleReport] = []
    for hid in harnesses:
        adapter = get_adapter(hid)
        probes = facts.probes_for(hid, cfg, home)
        reports.append(
            detect_idle(
                hid,
                probes,
                quiet_minutes=cfg.quiet_minutes,
                process_names=adapter.process_names(),
            )
        )
    return reports
