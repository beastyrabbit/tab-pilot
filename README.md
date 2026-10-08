# Tab Organizer

A standalone Chrome Manifest V3 extension that organizes tabs with your local EasyCLIProxyAPI connection.

## Local setup

Use Node.js 22.19.0 from `.node-version` or a compatible newer version with Corepack installed. Verify `node --version` and `corepack --version` before opening a T3 worktree. The project pins pnpm 11.5.0.

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build:extension`
3. Start EasyCLIProxyAPI and complete its Codex OAuth login. This uses your ChatGPT subscription and does not require an OpenAI API key.
4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/dist`.
5. Configure the proxy URL in the extension Settings. The default is `http://127.0.0.1:8317/v1`.

Use the scripts in `t3.json` for the common local workflow. Run `pnpm package:extension` to create the upload ZIP at `apps/extension/.local/tab-organizer-store.zip`.

T3 runs **Set up worktree** from the versioned root `t3.json` when it creates a new worktree. It installs locked dependencies with `corepack pnpm@11.5.0 install --ignore-scripts --ignore-pnpmfile --frozen-lockfile` and waits for completion before the agent starts. Build the extension manually after reviewing the checkout. The setup does not start the proxy or any long-lived service.

Git worktrees do not copy ignored or untracked files. T3 does not read `.worktreeinclude`; it remains for compatibility with other worktree tools. Configure any needed local settings separately. Do not copy `.env` values or secrets into new worktrees.
