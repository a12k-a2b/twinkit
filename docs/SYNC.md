# TwinKit Sync

Cold handoff of AI coding harness state across **2–3 Macs** (MacBook Air, Mac mini, optional 3rd Mac). Start a thread on one desk, park it, continue on the other.

This is an expansion of TwinKit’s one-shot pack/unpack — it does **not** replace `twin-pack`. TwinKit remains the bootstrap (“clone this desk onto a new Mac”). Sync is the everyday locker between machines that already exist.

**Honest UX**

| Supported | Not supported (v1) |
| --- | --- |
| Park on machine A → resume on B with the same threads, skills, artifacts | Both machines live-editing the same local agent thread |
| Exclusive lock so only one Mac “owns” live harnesses | Pretending local SQLite is Google Docs |
| Idle **bounce** so Anjan never has to quit apps by hand | Live Syncthing of `state.vscdb` while Cursor is open |

Long Cursor threads that must survive a laptop switch: prefer **Cursor Cloud Agents** (already server-side). Sync is for local Composer / CLI / Antigravity state.

---

## Install

From a TwinKit checkout (python3, no extra pip deps):

```bash
git clone https://github.com/a12k-a2b/twinkit.git
cd twinkit
./install.sh
```

That puts `twinkit` and `twinkit-sync` on `~/.local/bin` (same place as `twin-pack`). Then:

```bash
twinkit sync init --machine air          # or mini / other
# on the other Mac:
twinkit sync init --machine mini --remote git@github.com:YOU/twinkit-sync-vault.git
```

`twinkit sync …` and `twinkit-sync …` are the same CLI.

---

## Pair 2–3 Macs

Machine ids are fixed: **`air`**, **`mini`**, **`other`**.

Default home prefixes (override at `init` or in `~/.twinkit/sync/config.json`):

| Id | Typical host | Home prefix |
| --- | --- | --- |
| `air` | MacBook Air | `/Users/anjan` |
| `mini` | Mac mini | `/Users/anjanmacmini` |
| `other` | 3rd Mac | `/Users/Shared/twin-other` |

**Transport v1** (pick one in config):

1. **Private git vault** (preferred for 3 machines) — a private repo TwinKit Sync commits into. No secrets; `auth.json` never lands here.
2. **Local Syncthing folder** — TwinKit Sync only reads/writes the folder. Syncthing is the pipe. Still **cold**: never point Syncthing at live `Application Support` SQLite.

Suggested vault layout (created by `init`):

```
~/.twinkit/sync/vault/
  .twinkit/lock.json      # exclusive owner
  .twinkit/state.json     # last push / peer-stale
  cursor/  codex/  claude/  ag/
  META.json
```

Pairing recipe:

1. `twinkit sync init --machine air --transport git --remote git@…:…/twinkit-sync-vault.git`
2. On mini / other: same `--remote`, different `--machine`.
3. On the desk you will use: `twinkit sync checkout`
4. When you walk away: `twinkit sync release` (or let bounce do it when idle)

Protocol: **checkout → apps closed (or bounce) → pull vault → import → own lock → work → release → push vault → unlock**.

---

## Bounce (required UX)

Anjan almost never closes apps. `twinkit sync bounce` is the core command:

1. **Detect idle** (conservative — see heuristics below).
2. Gracefully **quit** target harnesses (`osascript` then `SIGTERM`).
3. Cold **sync** (pack → vault → unpack/import with path rewrite).
4. **Relaunch** the same apps.
5. macOS notification: `TwinKit Sync bounced Cursor+Codex`.

```bash
twinkit sync bounce                                # only if idle
twinkit sync bounce --harness cursor,codex
twinkit sync bounce --now --force                  # quit even if not idle
twinkit sync schedule install                      # launchd: 3h idle-gated + nightly deep
```

`--now` means “don’t wait for idle” (apps may be open). It **requires `--force`** so a stray keypress cannot quit a desk. **Never bounce if an agent is clearly mid-run**, including with `--now --force`.

### Idle heuristics (conservative)

Any busy signal → not idle. Mid-run → hard stop.

| Signal | Idle? | Mid-run? |
| --- | --- | --- |
| App not running, no recent session writes | yes | no |
| App open, quiet ≥ N minutes (default **15**), CPU low, no agent children | **yes** (this is the normal case) | no |
| Agent child process (`cursor-agent`, `codex exec`, `claude -p`, …) | no | **yes** |
| Session/transcript mtime &lt; 2 minutes while the UI is open | no | **yes** |
| Recent writes (2–15 min) + high CPU or model sockets | no | **yes** |
| Recent writes, cool CPU, no children | no (not quiet) | no |
| Established model sockets **alone** | still idle | no (idle apps keep websockets) |
| Optional HID idle seconds, if the host provides them | used as a quiet signal | never guessed if missing |

Scheduled bounce (launchd every **3 hours**, also reasonable on login/unlock):

- bounce if idle, **or**
- bounce if **this machine holds the exclusive lock** and peers need an update (unpublished local work)

Nightly (~02:00) `twinkit sync sync --deep --scheduled` packs large trees (Codex sessions, AG conversations) when it is safe.

### Cadence

| When | What |
| --- | --- |
| Every 3h + on login/unlock | idle-gated bounce |
| `twinkit sync release` | immediate pack + push + unlock (desk switch) |
| Nightly ~02:00 | deep sync for large trees |
| Always | git for skills / rules / scripts **in repos** |
| Prefer | Cursor Cloud Agents for long Cursor threads |

Avoid: realtime Syncthing of Application Support SQLite while apps are open. Hourly only as an optional mode with a hard “apps quit” gate.

---

## Path rewrite (mandatory)

Mini home `/Users/anjanmacmini` vs Air `/Users/anjan`. Anything keyed by absolute path — Claude `~/.claude/projects/<escaped-path>`, Cursor workspace slugs, Antigravity trajectory indexes — will not line up unless we rewrite **on import**.

Config maps `machine id → home prefix`. On import TwinKit Sync rewrites:

- absolute paths (`/Users/anjanmacmini/Projects/foo` → `/Users/anjan/Projects/foo`)
- Claude-style escaped dirs (`-Users-anjanmacmini-Projects-foo`)
- JSON `\/` escapes and URL-encoded forms

Replacement is **boundary-aware**: `/Users/anjan` is a prefix of `/Users/anjanmacmini`, so a naive `str.replace` would corrupt Mini paths. We only replace when the next character is a path boundary (`/`, `-`, quote, whitespace, EOS).

**Root-relative project identity** (Claude, borrowed from claudesync): each packed project records `Projects/foo` rather than a single absolute path. On import we resolve `local_home + relative`, unless the source already lived under a **canon root**.

Optional canon roots (default `/Users/Shared/Projects`) are the same absolute path on every Mac — they are left alone. If you can, put shared checkouts there (or matching symlinks) so IDE indexes stay honest.

---

## Exclusive lock

Vault file `.twinkit/lock.json`. Only one machine owns live harnesses.

```bash
twinkit sync checkout     # acquire (fails if air/mini/other already holds it)
twinkit sync release      # pack + push + unlock
twinkit sync bounce       # respects the lock
```

`--force` on checkout is an explicit steal (other Mac is gone). `doctor` reports the holder; there is no silent steal.

---

## Harnesses

| Id | Trees | Never |
| --- | --- | --- |
| `cursor` | `~/.cursor/skills`, `commands`, `projects/*/agent-transcripts`, settings when quit; `state.vscdb` only on **deep** + app quit | live SQLite while Cursor is open |
| `codex` | `~/.codex` config, `AGENTS.md`, `sessions/` (**last_N_days**, default 30; `--deep` = all) | `auth.json` |
| `claude` | `~/.claude` **and** `~/.claude-b` (`CLAUDE_CONFIG_DIR`) | credentials / OAuth / Keychain |
| `ag` | `~/.gemini/antigravity` + `antigravity-ide` (`conversations/`, `brain/`) | tokens, live IDE SQLite |

Codex sessions can be ~14GB. Prefer last-N-days or a one-way cold mirror, not live bidirectional.

Backup-before-overwrite: imports land a timestamped copy under `~/.twinkit/sync/backups/`.

---

## Exclusions (never sync)

- `auth.json`, credential filenames, Keychain
- glass locks (`~/.daylight/glass`) and per-host `devices.json`
- adb / `~/.android` state
- statsig / telemetry / GPU + code caches
- SQLite WAL/SHM (`*.vscdb-wal`, `*-shm`)
- huge caches / `node_modules` unless opted in

Secret scan (same pattern ids as TwinKit pack) fails a push unless `TWINKIT_ALLOW_SECRETS=1`. Hits are `path:line:id` only.

---

## CLI

```
twinkit sync init
twinkit sync status
twinkit sync push|pull|sync
twinkit sync checkout|release
twinkit sync bounce [--harness cursor,codex,claude,ag] [--now] [--force]
twinkit sync schedule install|uninstall
twinkit sync doctor
```

`--deep` on push/sync/release/bounce includes large trees and (when apps are quit) Cursor `state.vscdb`.

---

## Prior art (ideas borrowed, not vendored)

Reimplemented cleanly under TwinKit’s MIT license. Do not copy their source into this tree.

| Source | What we took |
| --- | --- |
| **TwinKit** (`twin-pack` / unpack) | Pack/unpack, redact/skip secrets, one-shot desk-clone DNA, fail-closed secret scan |
| **cursaves** | Cursor chat export/import via snapshots, path rewrite, **don’t write while Cursor is running** |
| **codexSync / codex-session-tui** | Cold Codex handoff, backup before overwrite |
| **claudesync / ccsync / claude-sync** | Claude allowlists, Syncthing as a vault pipe, **root-relative project identity** (not absolute paths) |
| **Antigravity community rclone** | Quit apps → copy `conversations/` + `brain/` → restore on the other Mac |

Off-the-shelf pipes we wrap rather than replace: private git, Syncthing, rclone-style cold folders. We do **not** live-sync Application Support.

---

## Design context (folded from SPEC + research)

Originally framed as “Daylight Harness Sync — Mini ↔ Air”. Layers:

0. Git project brain (rules, `AGENTS.md`, shared skills/scripts)
1. Prefer Cursor Cloud Agents when continuity matters
2. This CLI + exclusive lock + git/Syncthing vault (cold pack/import adapters)

**What cannot be naively synced:** glass-lock TTL holders, host-specific device serials, adb topology, OS sockets / live PIDs, SQLite WAL companions, auth/OAuth/MCP secrets, Keychain, path-encoded session dirs without rewrite, build outputs.

**Conflict risks** if you ignore the lock: dual writers on the same Codex rollout UUID, Cursor `composerHeaders` index merges, home-username mismatch, iCloud-on-Application-Support perpetual conflicts.

Research snapshot (2026-09-18): Mini `anjans-Mac-mini.local` / home `/Users/anjanmacmini`; Air `anjans-MacBook-Air-2.local` / home `/Users/anjan`. Confirm `$HOME`, Codex `state_*.sqlite`, which Antigravity flavor, Cursor 2.x vs 3.x, and whether Syncthing is already installed when those Macs are in reach.

---

## Tests

```bash
PYTHONPATH=sync python3 -m unittest discover -s sync/tests -p 'test_*.py'
# or
npm test
```

Path rewrite, lock (3 machines), idle stubs, bounce orchestration (quit/relaunch mocked). Linux CI does not need osascript.
