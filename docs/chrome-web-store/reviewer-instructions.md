# Chrome Web Store reviewer instructions

## Install

1. Load the submitted Manifest V3 package.
2. Open the extension side panel from the toolbar.
3. Grant the requested Chrome permissions when prompted.

## AI connection

The extension requires a user-configured EasyCLIProxyAPI endpoint. No developer API key or reviewer account is included. For a UI-only review, the panel, settings, local storage, grouping controls, fixed groups, run history, and proposal validation can be inspected without connecting to an AI service.

For an end-to-end AI review, run EasyCLIProxyAPI locally, authenticate it with a supported provider, and enter its API base URL in Settings. The default is `http://127.0.0.1:8317/v1`. The extension discovers models through `GET /models` and sends organization requests to `POST /chat/completions`.

## Core test

1. Open several tabs covering two or three topics.
2. Mark one existing tab group as a protected favorite with the star button.
3. Click Organize Tabs.
4. Review the proposal and expand groups to inspect assignments.
5. Click Apply.
6. Confirm the tabs move into the proposed groups and the favorite group remains protected.
7. Open Settings → Recent runs to inspect the proposal and post-Apply verification.

## Data and permissions

The `tabs` and `tabGroups` permissions are used to read and organize tabs. `scripting` is used only to read metadata or a short page excerpt from selected tabs for ambiguous classifications. `storage` stores local settings and history. `sidePanel` provides the extension interface. `activeTab` supports user-initiated page inspection. HTTP and HTTPS host access is required for user-selected proxy endpoints and on-demand page metadata extraction.
