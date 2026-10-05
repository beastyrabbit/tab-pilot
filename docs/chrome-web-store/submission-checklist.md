# Chrome Web Store submission checklist

The upload artifact is `apps/extension/.local/tab-organizer-store.zip`.

## Dashboard fields

- **Item:** upload `tab-organizer-store.zip`.
- **Visibility:** Unlisted for the first review.
- **Category:** Productivity → Workflow & Planning.
- **Language:** English.
- **Name:** Tab Organizer.
- **Short description:** paste the short description from `listing.md`.
- **Detailed description:** paste the detailed description from `listing.md`.
- **Screenshots:** upload `assets/screenshot-proposal.png` and `assets/screenshot-review.png`.
- **Small promotional tile:** upload `assets/promo-small-v2.png`.
- **Large promotional tile:** upload `assets/promo-large.png`.
- **Support:** link to the repository issue tracker.
- **Privacy policy:** publish `privacy-policy.md` at a public HTTPS URL, then paste that URL here.

## Privacy disclosures

Declare the following data categories because the extension reads tab URLs, titles, domains, and selected page metadata or excerpts:

- Web browsing activity / website content.
- Purpose: app functionality.
- The extension does not sell the data, use it for advertising, or use it for credit, insurance, employment, housing, or similar decisions.
- The extension does not include remote code.

The data is sent only to the EasyCLIProxyAPI endpoint chosen by the user when an AI operation is started. The privacy policy must use the same wording as the dashboard disclosures.

## Permission justifications

- `tabs`: read tab titles, URLs, window IDs, and group IDs to build a proposal and show the current tab list.
- `tabGroups`: create, update, preserve, collapse, and reorder tab groups after the user approves a proposal.
- `activeTab`: support user-initiated inspection of the active page.
- `scripting`: read metadata and a short page excerpt on selected tabs when title and URL are ambiguous.
- `sidePanel`: provide the Tab Organizer interface.
- `storage`: store local settings, fixed groups, memories, stored sets, summary cache, and run history.
- `http://*/*` and `https://*/*`: reach the user-configured proxy, including local-network HTTP addresses, and perform on-demand metadata extraction on user-selected pages.

## Reviewer test notes

Paste the contents of `reviewer-instructions.md` into the dashboard's test instructions field. No developer API key, proxy key, or test account should be included in the listing or reviewer instructions.

## Final action

After all fields are complete, use **Submit for review**. Google controls approval and may request changes to the privacy disclosures or broad host permission justification.
