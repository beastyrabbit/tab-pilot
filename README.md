<p align="center">
  <img src="apps/extension/public/icons/icon128.png" alt="Tab Pilot" width="80" />
</p>

<h1 align="center">Tab Pilot</h1>

<p align="center">
  <strong>AI-powered Chrome extension that intelligently organizes your browser tabs into groups.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/chrome-MV3-blue?logo=googlechrome&logoColor=white" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/hono-server-orange?logo=hono&logoColor=white" alt="Hono" />
  <img src="https://img.shields.io/badge/pi%20codex-AI-purple" alt="Pi Codex AI" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

---

## Screenshots

<!-- Replace these placeholders with actual screenshots of your extension -->

| Organize | Proposal View | Settings |
|:---:|:---:|:---:|
| ![PLACEHOLDER](https://placehold.co/300x500/1a1a2e/e0e0e0?text=Side+Panel) | ![PLACEHOLDER](https://placehold.co/300x500/1a1a2e/e0e0e0?text=Proposals) | ![PLACEHOLDER](https://placehold.co/300x500/1a1a2e/e0e0e0?text=Settings) |

> *Replace the placeholders above with real screenshots — open the side panel, take a screenshot, and save to `docs/` folder.*

---

## Features

**Smart Grouping** — Click "Organize" and the AI builds structured semantic profiles from titles, URLs, metadata, and optional screenshots, then groups by shared project or topic. Site-only groups are a fallback, and uncertain tabs stay ungrouped.

**Preview Before Apply** — See proposed groups in a color-coded proposal view. Approve, dismiss, or refine with natural language feedback ("move YouTube to Entertainment", "keep GitHub separate").

**Existing Group Awareness** — Treats manually created groups as a strong prior, extending coherent groups while still allowing clearly misplaced tabs to move.

**Adaptive Evidence** — Fast metadata profiles are generated in batches. Targeted headings and cleaned main-page text, screenshots, or specialist delegates are used only when the lead model needs more evidence.

**AI Memory** — Save reusable organization preferences as memories that influence future suggestions.

**User Rules** — Define deterministic rules ("github.com → Development") that are applied before the AI runs.

**Semantic Profile Cache** — The background service worker caches structured tab profiles server-side, fingerprints them against current tab evidence, and shows their stage in the tab list.

**Drag & Drop** — Manually move tabs between groups with drag-and-drop in the side panel.

**Search** — Search across tab titles, URLs, page content, and AI-generated summaries.

---

## Architecture

```
┌─────────────────────────┐     ┌───────────────────────┐     ┌──────────────┐
│   Chrome Extension      │     │   Local Server        │     │ Pi + Codex   │
│   (Side Panel UI)       │◄───►│   127.0.0.1:7777     │◄───►│ openai-codex │
│                         │     │                       │     │              │
│  React 19 + Vite        │     │  Hono + TypeScript    │     │  Tool calls  │
│  TailwindCSS            │     │  SQLite + Drizzle     │     │  Summaries   │
│  chrome.tabs/tabGroups  │     │  Memory & summaries   │     │              │
│  @dnd-kit (drag & drop) │     │  Content bridge (SSE) │     │ Sol + Terra  │
└─────────────────────────┘     └───────────────────────┘     └──────────────┘
```

**Why a local server?** Your Codex OAuth credential stays on disk (never in the browser), AI orchestration is simpler server-side, and memories, rules, settings, and tab profiles persist in a local SQLite database.

The AI runtime is fixed in server code and exposed read-only at `GET /api/ai/runtime`: `gpt-5.6-sol` leads organization and refinement at high reasoning, while `gpt-5.6-terra` creates batched profiles at medium reasoning. The lead can conditionally delegate ambiguous subsets to Terra or Sol, with at most three delegate calls. The Settings panel reports these real roles and authentication state; it does not pretend to switch models.

### Monorepo Structure

```
tab-pilot/
├── packages/shared/        # @tab-orga/shared — TypeScript types
├── apps/extension/         # Chrome extension (React side panel + service worker)
│   ├── manifest.json       # Manifest V3
│   ├── src/sidepanel/      # React app (components, hooks, services)
│   ├── src/background/     # Service worker
│   └── src/content/        # Content script (on-demand extraction)
└── apps/server/            # Companion server (Hono on port 7777)
    ├── src/routes/         # API endpoints
    └── src/services/       # Pi orchestration, storage, content bridge
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 22.19.0
- **pnpm** ≥ 11
- **Docker** with Compose for the local production server
- **Pi Codex auth** — run `pnpm pi:login` once after installing dependencies
- **Chrome** or **Chromium** ≥ 120

### Install & Build

```bash
# Clone
git clone https://github.com/beastyrabbit/tab-pilot.git
cd tab-pilot

# Install dependencies
pnpm install --frozen-lockfile

# Authenticate the Pi openai-codex provider
pnpm pi:login

# Build the server and extension
pnpm build
```

### Run the Local Production Server

```bash
docker compose up -d --build
docker compose logs -f tab-pilot-server
```

The server uses Docker host networking and binds to `127.0.0.1:7777` on the host. Runtime data is stored in
`apps/server/data`. Pi auth is mounted from `apps/server/credentials/`, so credential updates and
their lock share one writable filesystem and survive image
rebuilds. Verify with:

```bash
curl http://127.0.0.1:7777/api/health
```

Daily start after the image has already been built:

```bash
docker compose up -d
```

### Install the Local CRX

```bash
pnpm crx:pack
pnpm crx:install
```

`pnpm crx:pack` writes ignored local artifacts under `apps/extension/.local/`:

- `tab-pilot.pem` is the persistent key. Keep it forever; replacing it changes the extension ID.
- `tab-pilot.crx` is the packed extension.
- `updates.xml` is the local Chromium update manifest.
- `chromium-managed-policy.json` is the managed policy for force-installing the local CRX.
- `chromium-external-extension.json` is the legacy Linux external install JSON.

`pnpm crx:install` also tries to write the managed policy JSON to
`/etc/chromium/policies/managed/tab-pilot.json`. If the current user cannot write there, the script
prints the exact `sudo install -Dm644 ...` command to run. Restart Chromium after installing or
updating the policy; Tab Pilot should appear as policy-installed without enabling Developer Mode.

If you specifically want the older Linux external extension preferences flow instead of managed
policy, use `pnpm crx:install-external`.

When changing extension code, run `pnpm build`, repack with the same PEM key, and bump
`apps/extension/manifest.json` `version` when Chromium needs to pick up the update.

Complete documentation:

- [Documentation index (Deutsch)](docs/index.md)
- [Application and usage (Deutsch)](docs/anwendung.md)
- [Architecture (Deutsch)](docs/architektur.md)
- [AI and tab analysis (Deutsch)](docs/ai-und-tab-analyse.md)
- [HTTP API (Deutsch)](docs/api.md)
- [Data and security (Deutsch)](docs/daten-und-sicherheit.md)
- [Development (Deutsch)](docs/entwicklung.md)
- [Deployment (Deutsch)](docs/deployment.md)

Additional operational guides:

- [Local Production Setup](docs/local-production.md)
- [Docker Server](docs/docker-server.md)
- [Chromium CRX Install](docs/chromium-crx.md)

---

## Usage

### Organizing Tabs

1. Open several tabs across different topics
2. Open the Tab Pilot side panel
3. Optionally enter a one-off instruction, then click **Organize**
4. Review the AI's proposed groups in the preview
5. Optionally type feedback to update the proposal ("put Twitch in its own group")
6. Click **Apply** to create the Chrome tab groups

### Settings

- **AI Runtime** — Read-only, truthful status for the fixed lead, delegate, and profile models plus Codex authentication
- **Organization Preferences** — Standing instructions (e.g., "homelab is always a good group")
- **Group Title Length** — Short initials, one concise word, or a compact multi-word title
- **Test Mode** — Preview without applying changes
- **Ungroup all** — Remove all tab groups in the current Chrome window from the main toolbar

### Memory & Rules

- **Memories** — View, edit, or clear what the AI has learned. Use "AI Edit" to bulk-manage memories with natural language.
- **Rules** — Deterministic rules (e.g., `github.com → Development`) override the AI. The server API supports full rule management; the existing editor is not currently linked from the shipped side panel.

---

## Development

```bash
# Dev mode (server with hot reload)
pnpm dev:server

# Dev mode (extension — rebuild on changes)
pnpm dev:extension

# Build extension for loading
pnpm build:extension

# Build and smoke-check the production server
pnpm build:server
pnpm smoke:server

# Run tests
pnpm test

# Lint & format (Biome)
pnpm lint
pnpm lint:fix
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension UI | React 19, Vite, TailwindCSS 4, @dnd-kit |
| Extension APIs | chrome.tabs, chrome.tabGroups, chrome.scripting, chrome.debugger, chrome.alarms, chrome.storage |
| Server | Hono, TypeScript, Zod validation, SQLite, Drizzle |
| AI Backend | Pi Agent + OpenAI Codex Responses (`gpt-5.6-sol`, `gpt-5.6-terra`) |
| Monorepo | pnpm workspaces |
| Quality | Biome (lint + format), Vitest, Lefthook (git hooks) |

---

## Known Issues

- **Tab group colors** — `chrome.tabGroups.update()` correctly sets colors via the API, but Chrome/Chromium may not visually render the color change on some platforms (confirmed Linux/Chromium). This is a [Chromium rendering bug](https://issues.chromium.org/issues?q=tabGroups%20color) — the internal state is correct but the UI doesn't repaint. Manual color changes through Chrome's UI work fine.

---

## License

MIT
