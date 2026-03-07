chrome.action.onClicked.addListener(() => {
	chrome.sidePanel.setOptions({ enabled: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
