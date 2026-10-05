// The extension has no companion backend. AI requests go directly from the side panel
// to the user's configured EasyCLIProxyAPI endpoint.
chrome.action.onClicked.addListener(() => {
	void chrome.sidePanel.setOptions({ enabled: true });
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
