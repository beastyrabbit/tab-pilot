chrome.action.onClicked.addListener(() => {
	chrome.sidePanel.setOptions({ enabled: true });
	// The side panel will open when the action is clicked
	// since we declared it in manifest.json
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
