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
  <img src="https://img.shields.io/badge/codex-AI-purple" alt="Codex AI" />
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

**Smart Grouping** — Click "Organize" and the AI analyzes your tabs by title, URL, meta descriptions, and optionally full page content, then suggests logical groups.

**Preview Before Apply** — See proposed groups in a color-coded proposal view. Approve, dismiss, or refine with natural language feedback ("move YouTube to Entertainment", "keep GitHub separate").

**Existing Group Awareness** — Respects your manually created groups. The AI extends them rather than creating duplicates.

**Content Extraction** — Configurable depth: title+URL only, meta descriptions, or full page text for the most accurate grouping.

**AI Memory** — The AI learns your preferences over time. Corrections are analyzed and stored as memories that influence future suggestions.

**User Rules** — Define deterministic rules ("github.com → Development") that are applied before the AI runs.

**Screenshot Summaries** — Background tab screenshots are captured and summarized by AI, enabling deep full-text search across all your tabs.

**Drag & Drop** — Manually move tabs between groups with drag-and-drop in the side panel.

**Search** — Search across tab titles, URLs, page content, and AI-generated summaries.

---

## Architecture

```
┌─────────────────────────┐     ┌───────────────────────┐     ┌──────────────┐
│   Chrome Extension      │     │   Local Server        │     │   Codex CLI  │
│   (Side Panel UI)       │◄───►│   localhost:7777      │◄───►│   (AI)       │
│                         │     │                       │     │              │
│  React 19 + Vite        │     │  Hono + TypeScript    │     │  GPT / Claude│
│  TailwindCSS            │     │  Memory & Rules (JSON)│     │  etc.        │
│  chrome.tabs/tabGroups  │     │  Screenshot cache     │     │              │
│  @dnd-kit (drag & drop) │     │  Content bridge (SSE) │     │              │
└─────────────────────────┘     └───────────────────────┘     └──────────────┘
```

**Why a local server?** Your API key stays on disk (never in the browser), AI orchestration is simpler server-side, and memories/rules persist as JSON files. Swapping AI providers is a config change.

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
    ├── src/services/       # Codex integration, storage, content bridge
    └── src/prompts/        # AI prompt builders
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Codex CLI** — installed and in your PATH ([install guide](https://github.com/openai/codex))
- **Chrome** or **Chromium** ≥ 120

### Install & Build

```bash
# Clone
git clone https://github.com/beastyrabbit/tab-pilot.git
cd tab-pilot

# Install dependencies
pnpm install

# Build the extension
pnpm build:extension
```

### Start the Server

```bash
pnpm dev:server
```

The server runs on `http://localhost:7777`. Verify with:

```bash
curl http://localhost:7777/api/health
```

### Load the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `apps/extension/dist/` folder
5. Click the Tab Pilot icon — the side panel opens

---

## Usage

### Organizing Tabs

1. Open several tabs across different topics
2. Open the Tab Pilot side panel
3. Click **Organize**
4. Review the AI's proposed groups in the preview
5. Optionally type feedback to refine ("put Twitch in its own group")
6. Click **Apply** to create the Chrome tab groups

### Settings

- **Model** — Choose which AI model to use
- **Content Depth** — How much page content to send to the AI
  - *Title + URL* — fastest, works for most cases
  - *Meta descriptions* — better accuracy
  - *Full page content* — best accuracy, slower
- **General Behavior** — Custom instructions (e.g., "homelab is always a good group")
- **Test Mode** — Preview without applying changes
- **Dissolve All Groups** — Remove all tab groups at once

### Memory & Rules

- **Memories** — View, edit, or clear what the AI has learned. Use "AI Edit" to bulk-manage memories with natural language.
- **Rules** — Create deterministic rules (e.g., `github.com → Development`) that override the AI.

---

## Development

```bash
# Dev mode (server with hot reload)
pnpm dev:server

# Dev mode (extension — rebuild on changes)
pnpm dev:extension

# Build extension for loading
pnpm build:extension

# Run tests
pnpm test

# Lint & format (Biome)
pnpm lint
pnpm lint:fix
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension UI | React 19, Vite, TailwindCSS 3, @dnd-kit |
| Extension APIs | chrome.tabs, chrome.tabGroups, chrome.scripting, chrome.debugger |
| Server | Hono, TypeScript, Zod validation |
| AI Backend | Codex CLI (app-server JSON-RPC protocol) |
| Monorepo | pnpm workspaces |
| Quality | Biome (lint + format), Vitest, Lefthook (git hooks) |

---

## Known Issues

- **Tab group colors** — `chrome.tabGroups.update()` correctly sets colors via the API, but Chrome/Chromium may not visually render the color change on some platforms (confirmed Linux/Chromium). This is a [Chromium rendering bug](https://issues.chromium.org/issues?q=tabGroups%20color) — the internal state is correct but the UI doesn't repaint. Manual color changes through Chrome's UI work fine.

---

## License

MIT
