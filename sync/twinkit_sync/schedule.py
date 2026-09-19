"""launchd templates: 3h idle-gated bounce + nightly deep sync."""

from __future__ import annotations

import os
from pathlib import Path

IDLE_LABEL = "com.twinkit.sync.idle"
NIGHTLY_LABEL = "com.twinkit.sync.nightly"

IDLE_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.twinkit.sync.idle</string>
  <key>Comment</key>
  <string>TwinKit Sync: every 3 hours, bounce only if idle or lock-holder with stale peers</string>
  <key>ProgramArguments</key>
  <array>
    <string>__TWINKIT_SYNC_BIN__</string>
    <string>bounce</string>
    <string>--scheduled</string>
  </array>
  <key>StartInterval</key>
  <integer>10800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>__HOME__/Library/Logs/twinkit-sync-idle.log</string>
  <key>StandardErrorPath</key>
  <string>__HOME__/Library/Logs/twinkit-sync-idle.err.log</string>
</dict>
</plist>
"""

NIGHTLY_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.twinkit.sync.nightly</string>
  <key>Comment</key>
  <string>TwinKit Sync: nightly deep sync (~02:00) for Codex sessions + AG conversations</string>
  <key>ProgramArguments</key>
  <array>
    <string>__TWINKIT_SYNC_BIN__</string>
    <string>sync</string>
    <string>--deep</string>
    <string>--scheduled</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>__HOME__/Library/Logs/twinkit-sync-nightly.log</string>
  <key>StandardErrorPath</key>
  <string>__HOME__/Library/Logs/twinkit-sync-nightly.err.log</string>
</dict>
</plist>
"""


def render_plist(template: str, *, bin_path: str, home: str) -> str:
    return template.replace("__TWINKIT_SYNC_BIN__", bin_path).replace("__HOME__", home)


def default_bin() -> str:
    override = os.environ.get("TWINKIT_SYNC_BIN")
    if override:
        return override
    local = Path.home() / ".local" / "bin" / "twinkit-sync"
    if local.exists():
        return str(local)
    return "twinkit-sync"


def agents_dir(home: str | None = None) -> Path:
    root = home or str(Path.home())
    return Path(root) / "Library" / "LaunchAgents"


def install_schedule(
    *,
    home: str | None = None,
    bin_path: str | None = None,
    write: bool = True,
) -> dict[str, Path]:
    h = home or str(Path.home())
    dest = agents_dir(h)
    dest.mkdir(parents=True, exist_ok=True)
    binary = bin_path or default_bin()
    written: dict[str, Path] = {}
    mapping = {
        IDLE_LABEL: render_plist(IDLE_PLIST, bin_path=binary, home=h),
        NIGHTLY_LABEL: render_plist(NIGHTLY_PLIST, bin_path=binary, home=h),
    }
    for label, body in mapping.items():
        path = dest / f"{label}.plist"
        if write:
            path.write_text(body)
        written[label] = path
    return written


def uninstall_schedule(*, home: str | None = None) -> list[Path]:
    dest = agents_dir(home)
    removed: list[Path] = []
    for label in (IDLE_LABEL, NIGHTLY_LABEL):
        path = dest / f"{label}.plist"
        if path.exists():
            path.unlink()
            removed.append(path)
    return removed


def template_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "launchd"
