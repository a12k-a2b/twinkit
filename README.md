# TwinKit

**Clone your Claude Code (and Codex) desk onto the Mac you leave at home.**

Public repo: [github.com/a12k-a2b/twinkit](https://github.com/a12k-a2b/twinkit)

A guided migration checklist + four shell scripts. You still sign in yourself — TwinKit keeps the mountain from becoming a fog.

| | |
| --- | --- |
| **Version** | 0.5.0 — sprint mode |
| **What it is** | Web app (React) + `twin-*.sh` scripts you run in Terminal |
| **Who it’s for** | People whose **primary** Claude Code environment is a Mac, cloning it to a Mini / Studio / spare |
| **What it is not** | Auto-login, a native menu bar app, or a cloud sync service |
| **License** | MIT |

## Workflow

```
  OLD MAC (the one that works)          NEW MAC (home Mini / Studio)
  1. Discover  → INVENTORY.json         4. Unpack pack folder
  2. Pack      → twinkit-pack-*         5. Re-login + Mac permissions
                 (secret-scanned)       6. Verify → PARITY.json
  3. AirDrop / SSD  ─────────────────►  7. Sprint until done
```

Human auth, Accessibility, Chrome extensions, and API keys **never** get cloned. That’s a feature.

### 1. Pick a lane (30 seconds)

| You are on… | TwinKit mode | Scripts |
| --- | --- | --- |
| The Mac that already works | **Pack** | `twin-discover.sh` → `twin-pack.sh` |
| The new Mini / Studio / spare | **Unpack** | `twin-unpack.sh` → `twin-verify.sh` |

Desk types: **Agents** · **Agents + CLIs** · **Full lab** (Android / Daylight DC1).

### 2. Sprint mode (the product)

Pick 15 / 30 / 60 minutes (or 25-min body double). One step, full-screen:

- **Done** · **Skip for now** · **Doesn’t apply**
- On-card Download / Copy / Open System Settings / Open sign-in
- Timer ends → win screen + save `progress.json`. Stopping is the feature.

Lanes: **Must** (agents work) · **Later** (Android/DC1) · **Polish** (Grok/Muse).

### 3. Scripts (`public/twinkit/`)

| Script | Does |
| --- | --- |
| `twin-discover.sh` | Inventory → `INVENTORY.json` |
| `twin-pack.sh` | rsync configs, redact rc, secret scan |
| `twin-unpack.sh` | Restore with `.twinkit-backup`; `--dry-run` |
| `twin-verify.sh` | Compare MANIFEST → `PARITY.json` |

Pack **requires rsync**. Secret hits **exit 2** unless `TWINKIT_ALLOW_SECRETS=1`.

## Run the app

Needs **Node 22**.

```bash
git clone https://github.com/a12k-a2b/twinkit.git
cd twinkit
npm install
npm run dev
```

Always **Save progress** into the pack folder before switching machines. Browser storage dies.

## Claude Code skill

Copy `public/twinkit/SKILL.md` to `~/.claude/skills/twinkit-migrate/SKILL.md`.

## Honest limits

- Native menu bar: browser HUD + Raycast helper only
- You re-auth Claude / Codex / Chrome yourself
- Pack folders are sensitive config — FileVault SSD, not iCloud
