"""Quit / relaunch harness apps. Injectable for CI (no osascript on Linux)."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Callable

HARNESS_APPS: dict[str, dict] = {
    "cursor": {
        "app_names": ["Cursor"],
        "process_names": ["Cursor", "Cursor Helper"],
        "open_args": ["-a", "Cursor"],
    },
    "codex": {
        "app_names": ["Codex"],
        "process_names": ["codex", "Codex"],
        "open_args": ["-a", "Codex"],
        "cli": True,
    },
    "claude": {
        "app_names": ["Claude"],
        "process_names": ["claude", "Claude"],
        "open_args": ["-a", "Claude"],
        "cli": True,
    },
    "ag": {
        "app_names": ["Antigravity", "Antigravity IDE"],
        "process_names": ["Antigravity", "Antigravity IDE"],
        "open_args": ["-a", "Antigravity"],
    },
}


@dataclass
class AppHooks:
    """Override quit / relaunch / notify in tests."""

    quit_fn: Callable[[str], None] | None = None
    relaunch_fn: Callable[[str], None] | None = None
    notify_fn: Callable[[str], None] | None = None
    quits: list[str] = field(default_factory=list)
    relaunches: list[str] = field(default_factory=list)
    notifications: list[str] = field(default_factory=list)

    def quit(self, harness: str) -> None:
        self.quits.append(harness)
        if self.quit_fn:
            self.quit_fn(harness)
            return
        _quit_macos(harness)

    def relaunch(self, harness: str) -> None:
        self.relaunches.append(harness)
        if self.relaunch_fn:
            self.relaunch_fn(harness)
            return
        _relaunch_macos(harness)

    def notify(self, message: str) -> None:
        self.notifications.append(message)
        if self.notify_fn:
            self.notify_fn(message)
            return
        _notify_macos(message)


def _run(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, capture_output=True, text=True, check=False)


def _quit_macos(harness: str) -> None:
    meta = HARNESS_APPS.get(harness) or {}
    for app in meta.get("app_names") or []:
        if shutil.which("osascript"):
            _run(
                [
                    "osascript",
                    "-e",
                    f'tell application "{app}" to quit',
                ]
            )
        # SIGTERM fallback for CLI-only harnesses / stubborn apps.
        if shutil.which("pkill"):
            _run(["pkill", "-TERM", "-x", app])
            _run(["pkill", "-TERM", "-f", app])


def _relaunch_macos(harness: str) -> None:
    meta = HARNESS_APPS.get(harness) or {}
    if shutil.which("open") and meta.get("open_args"):
        _run(["open", *meta["open_args"]])


def _notify_macos(message: str) -> None:
    if shutil.which("osascript"):
        escaped = message.replace('"', '\\"')
        _run(
            [
                "osascript",
                "-e",
                f'display notification "{escaped}" with title "TwinKit Sync"',
            ]
        )


def bounce_notification_text(harnesses: list[str]) -> str:
    labels = {
        "cursor": "Cursor",
        "codex": "Codex",
        "claude": "Claude",
        "ag": "Antigravity",
    }
    pretty = "+".join(labels.get(h, h) for h in harnesses)
    return f"TwinKit Sync bounced {pretty}"
