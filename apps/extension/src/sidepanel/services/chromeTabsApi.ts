import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";

const isChromeExtension = typeof chrome !== "undefined" && !!chrome.tabs;

export async function getAllTabs(): Promise<TabInfo[]> {
	if (!isChromeExtension) return [];
	const tabs = await chrome.tabs.query({ currentWindow: true });
	return tabs
		.filter((tab) => tab.id !== undefined && tab.url !== undefined)
		.map((tab) => ({
			id: tab.id!,
			windowId: tab.windowId,
			url: tab.url!,
			title: tab.title || "",
			favIconUrl: tab.favIconUrl,
			groupId: tab.groupId ?? chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
		}));
}

export async function getAllGroups(): Promise<TabGroupInfo[]> {
	if (!isChromeExtension) return [];
	const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
	const tabs = await getAllTabs();

	return groups.map((group) => ({
		id: group.id,
		title: group.title || undefined,
		color: group.color as TabGroupInfo["color"],
		collapsed: group.collapsed,
		tabIds: tabs.filter((tab) => tab.groupId === group.id).map((tab) => tab.id),
	}));
}

export async function groupTabs(tabIds: number[], groupId?: number): Promise<number> {
	if (!isChromeExtension) return -1;
	if (groupId !== undefined) {
		return chrome.tabs.group({ tabIds, groupId });
	}
	return chrome.tabs.group({ tabIds });
}

export async function updateGroup(
	groupId: number,
	properties: { title?: string; color?: chrome.tabGroups.ColorEnum; collapsed?: boolean },
): Promise<void> {
	if (!isChromeExtension) return;
	await chrome.tabGroups.update(groupId, properties);
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
	if (!isChromeExtension) return;
	await chrome.tabs.ungroup(tabIds);
}

export async function moveTabToGroup(tabId: number, groupId: number): Promise<void> {
	if (!isChromeExtension) return;
	await chrome.tabs.group({ tabIds: [tabId], groupId });
}
