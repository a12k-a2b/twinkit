"""TwinKit Sync — cold harness handoff across 2–3 Macs."""

__version__ = "0.1.0"

MACHINE_IDS = ("air", "mini", "other")
HARNESS_IDS = ("cursor", "codex", "claude", "ag")
DEFAULT_QUIET_MINUTES = 15
DEFAULT_SESSIONS_LAST_N_DAYS = 30
LOCK_RELPATH = ".twinkit/lock.json"
STATE_RELPATH = ".twinkit/state.json"
META_RELPATH = "META.json"
