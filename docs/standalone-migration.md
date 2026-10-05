# Standalone extension migration

The target setup is a Developer Mode extension that calls EasyCLIProxyAPI directly and stores app data in `chrome.storage.local`.

## Completed

- [x] Add proxy URL and optional proxy key settings.
- [x] Persist settings in `chrome.storage.local`.
- [x] Persist rules in `chrome.storage.local`.
- [x] Persist memories in `chrome.storage.local`.
- [x] Remove the server content bridge and use direct extension extraction.
- [x] Check EasyCLIProxyAPI through `/v1/models`.
- [x] Make CLIProxyAPI the only configured provider.
- [x] Remove Pi login from the project scripts.
- [x] Keep the extension build and typecheck passing.

## Remaining implementation

- [x] Move stored tab sets from the server into `chrome.storage.local`.
- [x] Move summary cache and summary generation into the extension service worker.
- [x] Move content bridge state into the extension service worker.
- [x] Replace organization run creation and polling with service-worker jobs.
- [x] Replace refinement requests with direct proxy requests.
- [x] Add a shared browser-safe proposal validator.
- [x] Remove all remaining `/api/*` calls from extension code.
- [x] Remove `serverApi.ts` and server-only health/status UI.
- [x] Remove `apps/server`, Docker Compose, and server package dependencies.
- [x] Replace CRX managed-policy packaging with Developer Mode output.
- [x] Update `t3.json` for unpacked extension builds.
- [x] Run an end-to-end check against EasyCLIProxyAPI: models, summaries, organize, refine, apply.
- [x] Update README and setup docs for the standalone workflow.

## Definition of done

The extension loads from `apps/extension/dist`, reaches EasyCLIProxyAPI without Docker, organizes and refines tabs, persists data after the side panel closes, and contains no imports or requests targeting the removed server.
