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
- [x] Replace background summaries with on-demand page context read during organize.
- [x] Remove the content bridge; the side panel reads page content directly.
- [x] Run organize directly from the side panel against the proxy.
- [x] Replace refinement requests with direct proxy requests.
- [x] Add a shared browser-safe proposal validator.
- [x] Remove all remaining `/api/*` calls from extension code.
- [x] Remove `serverApi.ts` and server-only health/status UI.
- [x] Remove `apps/server`, Docker Compose, and server package dependencies.
- [x] Replace CRX managed-policy packaging with Developer Mode output.
- [x] Update `t3.json` for unpacked extension builds.
- [x] Run an end-to-end check against EasyCLIProxyAPI: models, organize, refine, apply.
- [x] Update README and setup docs for the standalone workflow.

## Known limitations

- An organize or refine request runs inside the side panel. Closing the panel while the AI is working cancels that run; settings, fixed groups, stored sets, memories and run history persist.
- Moving organize runs into a service-worker job would let them survive the panel closing.

## Definition of done

The extension loads from `apps/extension/dist`, reaches EasyCLIProxyAPI without Docker, organizes and refines tabs, keeps its data in `chrome.storage.local` across side panel sessions, and contains no imports or requests targeting the removed server.
