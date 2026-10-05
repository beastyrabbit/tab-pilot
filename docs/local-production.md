# Standalone local development

Build with `pnpm build:extension`, then open `chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select `apps/extension/dist`.

The extension connects directly to EasyCLIProxyAPI at the URL configured in Settings (default `http://127.0.0.1:8317/v1`). Authenticate EasyCLIProxyAPI with its Codex OAuth flow to use the ChatGPT subscription; no OpenAI API key is required.
