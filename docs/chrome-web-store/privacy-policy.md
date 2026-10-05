# Tab Organizer privacy policy

Last updated: 2026-09-19

Tab Organizer is a Chrome extension that helps users organize open browser tabs. This policy explains what the extension handles and where it sends that information.

## Information handled

When the user opens the extension, it reads the tabs and tab groups needed to display and organize the current Chrome window. This can include tab titles, URLs, domains, group names, group colors, and favicon references.

When the user starts an AI operation, the extension may read page metadata and a short text excerpt from selected web pages when the title and URL are not enough to classify a tab. It sends the selected tab information to the EasyCLIProxyAPI endpoint configured by the user. The endpoint and any client key are user-provided settings.

The extension stores settings, protected-group markers, memories, stored tab sets, summary cache, and run history in `chrome.storage.local` on the user's device. Run history is designed to exclude full URLs, page text, prompts, proxy addresses, and proxy keys. The user can clear run history from Settings.

Tab Organizer does not require a Tab Organizer account and does not include remote code. It does not use tab information for advertising or sell it.

## How information is used

The information is used only to display tabs, generate organization suggestions, apply the user's approved organization, verify the result, and provide the local features described in the store listing. The developer does not operate a Tab Organizer server and does not receive this information.

## Third-party processing

The configured EasyCLIProxyAPI service and the AI provider selected by that service process the information needed to answer the user's request. Their terms and privacy policies apply. Users should configure a proxy they trust and should avoid organizing tabs containing information they do not want to send to that proxy.

## Sharing and sale

The developer does not sell the information handled by the extension and does not share it with advertisers. The extension does not use tab information for advertising.

## Security and deletion

The extension uses the connection selected by the user. Local data can be removed by clearing the extension's Chrome storage or using the relevant clear controls in the extension. Data sent to the configured proxy is governed by that proxy's retention and deletion practices.

## Contact

For support, use the issue tracker linked from the Chrome Web Store listing.
