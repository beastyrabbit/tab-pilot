# Tab Organizer

A standalone Chrome Manifest V3 extension that organizes tabs with your local EasyCLIProxyAPI connection.

## Local setup

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build:extension`
3. Start EasyCLIProxyAPI and complete its Codex OAuth login. This uses your ChatGPT subscription and does not require an OpenAI API key.
4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/dist`.
5. Configure the proxy URL in the extension Settings. The default is `http://127.0.0.1:8317/v1`.

Use the actions in `t3.json` for the common local workflow. Run `pnpm package:extension` to create the upload ZIP at `apps/extension/.local/tab-organizer-store.zip`.
