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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reorder groups to the left of the tab strip, then collapse them.
 *
 * Uses chrome.tabGroups.move() which moves entire groups at once and
 * preserves all metadata (title, color) — unlike chrome.tabs.move()
 * which can cause Chrome to reset group properties.
 */
export async function collapseAndReorderGroups(): Promise<void> {
	if (!isChromeExtension) return;

	const allGroups = await chrome.tabGroups.query({
		windowId: chrome.windows.WINDOW_ID_CURRENT,
	});

	console.log(`[reorder] ${allGroups.length} groups to reorder`);
	for (const g of allGroups) {
		console.log(`[reorder]   gid=${g.id} title="${g.title}" color="${g.color}"`);
	}

	// 1. Move each group to the left of the tab strip
	let leftIndex = 0;
	for (const group of allGroups) {
		try {
			console.log(`[reorder] Moving gid=${group.id} to index=${leftIndex}`);
			await chrome.tabGroups.move(group.id, { index: leftIndex });
			const memberTabs = await chrome.tabs.query({
				currentWindow: true,
				groupId: group.id,
			});
			leftIndex += memberTabs.length;

			// Check if move preserved metadata
			const after = await chrome.tabGroups.get(group.id);
			console.log(
				`[reorder] After move gid=${group.id}: title="${after.title}" color="${after.color}"`,
			);
		} catch (e) {
			console.log(`[reorder] FAILED to move group ${group.id}: ${e}`);
		}
	}

	// 2. Pause before collapsing — experimentally derived from the Chromium
	// rendering bug on Linux where group colors/titles can get lost if we
	// collapse immediately after move. These delays give Chrome's internal
	// state time to settle. Do not remove without testing on Linux/Chromium.
	await delay(150);

	for (const group of allGroups) {
		try {
			await chrome.tabGroups.update(group.id, { collapsed: true });
			const after = await chrome.tabGroups.get(group.id);
			console.log(
				`[reorder] After collapse gid=${group.id}: title="${after.title}" color="${after.color}" collapsed=${after.collapsed}`,
			);
		} catch {}
		// Stagger collapse calls to avoid racing Chrome's internal reorder
		await delay(50);
	}
}
