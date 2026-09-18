from twinkit_sync.adapters.antigravity import AntigravityAdapter
from twinkit_sync.adapters.base import HarnessAdapter
from twinkit_sync.adapters.claude import ClaudeAdapter
from twinkit_sync.adapters.codex import CodexAdapter
from twinkit_sync.adapters.cursor import CursorAdapter

ADAPTERS = {
    "cursor": CursorAdapter,
    "codex": CodexAdapter,
    "claude": ClaudeAdapter,
    "ag": AntigravityAdapter,
}


def get_adapter(harness: str) -> HarnessAdapter:
    cls = ADAPTERS.get(harness)
    if cls is None:
        raise KeyError(f"unknown harness {harness!r}")
    return cls()
