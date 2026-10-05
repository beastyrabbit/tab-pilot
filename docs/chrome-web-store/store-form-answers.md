# Chrome Web Store form answers

Use these values in the store dashboard for version 0.3.1.

## Datenschutz

Privacy policy URL: after enabling GitHub Pages for `main` / `/docs`, use `https://beastyrabbit.github.io/tab-pilot/privacy-policy.html` and verify it loads without sign-in.

Data use:

- The extension handles web browsing activity and website content: tab titles, URLs, domains, group names, and selected page metadata or short excerpts.
- Purpose: app functionality, specifically displaying tabs, proposing organization, applying the user's approved changes, and verifying the result.
- Data is sent only to the EasyCLIProxyAPI endpoint chosen by the user when an AI operation starts.
- The developer does not sell this data, use it for advertising, or use it for credit, insurance, employment, housing, or similar decisions.
- The extension does not include remote code.

Permission justifications:

- `tabs`: read tab titles, URLs, window IDs, and group IDs to build the proposal and show the current tab list.
- `tabGroups`: create, update, preserve, collapse, and reorder groups after the user approves a proposal.
- `activeTab`: support user-initiated inspection of the active page.
- `scripting`: read metadata and a short page excerpt on selected tabs when title and URL are ambiguous.
- `sidePanel`: provide the Tab Organizer interface.
- `storage`: store local settings, fixed groups, memories, stored sets, summary cache, and run history.
- `http://*/*` and `https://*/*`: reach the user-configured proxy, including local-network HTTP addresses, and perform on-demand metadata extraction on selected pages.

## Vertrieb

- Visibility: Unlisted.
- Regions: All regions.
- Pricing: Free.
- In-app purchases: None.
- Distribution account: the current publisher account.

## Zugriff

- No sign-in is required by Tab Organizer.
- No developer API key, proxy key, or test account is included.
- The user configures an EasyCLIProxyAPI base URL locally.

## Testanweisungen

Paste the complete contents of `reviewer-instructions.md`.

## Store-Eintrag

- Name: Tab Organizer
- Language: English
- Category: Productivity → Workflow & Planning
- Support URL: `https://github.com/beastyrabbit/tab-pilot/issues`
- Small promotional tile: `assets/promo-small-v2.png`
- Large promotional tile: `assets/promo-large.png`
