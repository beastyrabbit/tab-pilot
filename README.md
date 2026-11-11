# Tab Organizer

A standalone Chrome Manifest V3 extension that organizes tabs with your local EasyCLIProxyAPI connection.

## Local setup

Use Node.js 22.19.0 from `.node-version` or a compatible newer version, and pnpm 11 or newer. The project pins pnpm 11.5.0 in `packageManager`; a current pnpm switches to that version on its own, so Corepack is not required.

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build:extension`
3. Start EasyCLIProxyAPI and complete its Codex OAuth login. This uses your ChatGPT subscription and does not require an OpenAI API key.
4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/dist`.
5. Configure the proxy URL in the extension Settings. The default is `http://127.0.0.1:8317/v1`.

Run `pnpm package:extension` to create the upload ZIP at `apps/extension/.local/tab-organizer-store.zip`. It needs the system `zip` command.

The root `t3.json` lists the T3 Code project actions for this repository: **Set up worktree**, **Build extension**, **Package extension**, **Check code**, and **Watch extension**. T3 does not read this file on its own; the actions take effect only after they are imported into the T3 project settings on each machine. Once imported, **Set up worktree** runs when T3 creates a new worktree: it installs locked dependencies with `pnpm install --ignore-scripts --ignore-pnpmfile --frozen-lockfile` and waits for completion before the agent starts. Build the extension manually after reviewing the checkout. The setup does not start the proxy or any long-lived service.

Git worktrees do not copy ignored or untracked files. T3 does not read `.worktreeinclude`; it remains for compatibility with other worktree tools. Configure any needed local settings separately. Do not copy `.env` values or secrets into new worktrees.
