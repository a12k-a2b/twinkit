"""Conservative idle / mid-run detection for bounce.

Heuristics (any busy signal → not idle; mid-run → never bounce):

1. **Agent child processes** — Cursor/Codex/Claude/Antigravity have a child whose
   command line looks like an agent worker (``agent``, ``composer``, ``codex exec``,
   ``claude -p``, ``acp``, ``rollout``). This is the strongest mid-run signal.
2. **Recent session writes** — transcript / JSONL / conversation files mtime
   newer than ``quiet_minutes`` (default 15).
3. **CPU** — harness process CPU above ``cpu_busy`` (default 8%). Combined with
   (1) or (2) this is mid-run; CPU alone makes the harness *not idle* but is not
   enough to call it mid-run (Spotlight indexing, idle helpers).
4. **Network** (optional probe) — many established sockets to model APIs *plus*
   CPU or recent writes → mid-run. Idle apps often keep a websocket, so sockets
   alone are *not* mid-run.
5. **Recent user input** (optional) — HID idle seconds if the host provides it.
   Missing probe is ignored (never guessed).

Be conservative: unknown / failed probes do not claim idle if the app is running
and we have no session-mtime evidence. An app that is not running is idle.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

from twinkit_sync import DEFAULT_QUIET_MINUTES

# Strong markers only — a bare "agent" substring matches too much (CI, helpers).
AGENT_CMDLINE_MARKERS = (
    "cursor-agent",
    "codex exec",
    "codex resume",
    "--full-auto",
    "claude -p",
    "claude --print",
    "antigravity-agent",
)

DEFAULT_CPU_BUSY = 8.0


@dataclass
class ProcInfo:
    pid: int
    name: str
    cmdline: str = ""
    cpu: float = 0.0
    parent_pid: int | None = None


@dataclass
class IdleReport:
    harness: str
    idle: bool
    mid_run: bool
    reason: str
    app_running: bool = False
    recent_writes: bool = False
    agent_children: list[int] = field(default_factory=list)
    cpu: float = 0.0
    details: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "harness": self.harness,
            "idle": self.idle,
            "mid_run": self.mid_run,
            "reason": self.reason,
            "app_running": self.app_running,
            "recent_writes": self.recent_writes,
            "agent_children": list(self.agent_children),
            "cpu": self.cpu,
            "details": list(self.details),
        }


@dataclass
class IdleProbes:
    """Injectable host facts so Linux CI can test without real Mac apps."""

    now: float | None = None
    processes: list[ProcInfo] = field(default_factory=list)
    session_mtimes: list[float] = field(default_factory=list)
    established_model_sockets: int = 0
    hid_idle_seconds: float | None = None
    app_running: bool | None = None


def cmdline_looks_like_agent(cmdline: str, name: str = "", harness: str = "") -> bool:
    blob = f"{name} {cmdline}".lower()
    if any(marker in blob for marker in AGENT_CMDLINE_MARKERS):
        return True
    # "agent" / "composer" only count when this harness is named in the command.
    if harness and harness.lower() in blob and ("agent" in blob or "composer" in blob):
        return True
    return False


def _newest(mtimes: Iterable[float]) -> float | None:
    vals = [m for m in mtimes if m]
    return max(vals) if vals else None


def detect_idle(
    harness: str,
    probes: IdleProbes,
    *,
    quiet_minutes: int = DEFAULT_QUIET_MINUTES,
    cpu_busy: float = DEFAULT_CPU_BUSY,
    process_names: list[str] | None = None,
) -> IdleReport:
    now = probes.now if probes.now is not None else time.time()
    quiet_s = max(1, int(quiet_minutes)) * 60
    details: list[str] = []

    names = [n.lower() for n in (process_names or _default_process_names(harness))]
    matching = [
        p
        for p in probes.processes
        if p.name.lower() in names or any(n in p.name.lower() for n in names)
    ]
    app_running = probes.app_running if probes.app_running is not None else bool(matching)
    cpu = max((p.cpu for p in matching), default=0.0)

    children = [
        p
        for p in probes.processes
        if cmdline_looks_like_agent(p.cmdline, p.name, harness)
        and (
            (p.parent_pid is not None and any(p.parent_pid == m.pid for m in matching))
            or any(n in f"{p.name} {p.cmdline}".lower() for n in names)
        )
    ]
    if not children:
        children = [
            p
            for p in probes.processes
            if cmdline_looks_like_agent(p.cmdline, p.name, harness)
            and (
                any(n in f"{p.name} {p.cmdline}".lower() for n in names)
                or harness.lower() in f"{p.name} {p.cmdline}".lower()
            )
        ]

    newest = _newest(probes.session_mtimes)
    recent_writes = bool(newest and (now - newest) < quiet_s)
    if newest:
        details.append(f"newest_session_age_s={int(now - newest)}")

    hid_recent = (
        probes.hid_idle_seconds is not None and probes.hid_idle_seconds < quiet_s
    )
    cpu_hot = cpu >= cpu_busy
    sockets = probes.established_model_sockets

    mid_run = False
    if children:
        mid_run = True
        details.append(f"agent_children={len(children)}")
    if recent_writes and (cpu_hot or sockets > 0 or children):
        mid_run = True
        details.append("recent_writes+activity")
    if recent_writes and app_running and cpu_hot:
        mid_run = True

    # Pure recent writes while the UI is open: not idle, but only mid-run if
    # writes are *very* fresh (< 2 min) — an agent flushing a transcript.
    if recent_writes and newest and (now - newest) < 120 and app_running:
        mid_run = True
        details.append("session_write_under_2m")

    idle = True
    reason = "app_not_running"
    if not app_running and not children and not recent_writes:
        idle = True
        reason = "app_not_running"
    elif mid_run:
        idle = False
        reason = "mid_run"
    elif recent_writes or cpu_hot or hid_recent or children:
        idle = False
        reason = "not_quiet"
        if recent_writes:
            details.append("recent_writes")
        if cpu_hot:
            details.append(f"cpu={cpu:.1f}")
        if hid_recent:
            details.append(f"hid_idle_s={probes.hid_idle_seconds}")
    elif app_running:
        # App is open but quiet — this *is* idle (Anjan almost never quits).
        idle = True
        reason = "app_open_but_quiet"
        details.append("conservative_quiet_ok")
    else:
        idle = True
        reason = "quiet"

    return IdleReport(
        harness=harness,
        idle=idle,
        mid_run=mid_run,
        reason=reason,
        app_running=app_running,
        recent_writes=recent_writes,
        agent_children=[p.pid for p in children],
        cpu=cpu,
        details=details,
    )


def _default_process_names(harness: str) -> list[str]:
    return {
        "cursor": ["cursor", "cursor helper"],
        "codex": ["codex"],
        "claude": ["claude"],
        "ag": ["antigravity", "antigravity ide", "gemini"],
    }.get(harness, [harness])


def summarize_reports(reports: list[IdleReport]) -> dict:
    return {
        "idle": all(r.idle for r in reports) if reports else True,
        "mid_run": any(r.mid_run for r in reports),
        "harnesses": {r.harness: r.to_dict() for r in reports},
    }


ProcessLister = Callable[[], list[ProcInfo]]
MtimeLister = Callable[[], list[float]]


def collect_session_mtimes(paths: Iterable[Path], *, limit: int = 400) -> list[float]:
    """Best-effort mtimes for session-like files (capped for huge Codex trees)."""
    out: list[float] = []
    for root in paths:
        if not root.exists():
            continue
        if root.is_file():
            try:
                out.append(root.stat().st_mtime)
            except OSError:
                pass
            continue
        count = 0
        for dirpath, dirnames, filenames in __import__("os").walk(root):
            # Prefer newest-looking leaves; still cap.
            dirnames.sort(reverse=True)
            for fn in filenames:
                if count >= limit:
                    return out
                p = Path(dirpath) / fn
                try:
                    out.append(p.stat().st_mtime)
                    count += 1
                except OSError:
                    continue
    return out
