# Chrome Web Store listing

## Name

Tab Organizer

## Short description

Organize Chrome tabs with your own local AI proxy and keep important groups protected.

## Detailed description

Tab Organizer groups open Chrome tabs by topic and task. Review the proposed changes before applying them, keep uncertain tabs ungrouped, and mark important groups as protected favorites.

### Features

- Preview every proposed group before applying changes.
- Preserve and prefer protected favorite groups.
- Use existing groups or create focused new groups.
- Choose soft grouping for cautious suggestions or hard grouping for complete coverage.
- Inspect recent runs, assignments, omissions, warnings, and the verified result after Apply.
- Detect exact duplicate URLs and optionally close older copies.
- Discover available models, thinking levels, and service tiers from your configured proxy.

### AI connection

The extension does not provide an OpenAI API key or a hosted AI service. It connects to an EasyCLIProxyAPI instance that you run and configure. EasyCLIProxyAPI can use Codex OAuth and your ChatGPT subscription. The extension sends tab information to the proxy only when you start an AI operation.

Install and sign in to EasyCLIProxyAPI separately, then enter its local API address in Settings. The default address is `http://127.0.0.1:8317/v1`.

### Privacy

Tab titles, domains, URLs, and selected page metadata or excerpts may be sent to the proxy you configure so it can classify tabs. Run history and settings are stored locally in Chrome. The extension does not send this information to a Tab Organizer server. See the privacy policy for details.

## Category

Productivity → Workflow & Planning

## Language

English

## Visibility for first submission

Unlisted
