import type { StoredTabSet, TabGroupInfo, TabInfo } from "@tab-orga/shared";

const isChromeExtension = typeof chrome !== "undefined" && !!chrome.tabs;

type ChromeTabIds = number | [number, ...number[]];

const toChromeTabIds = (tabIds: number[]): ChromeTabIds => {
	if (tabIds.length === 0) {
		throw new Error("Cannot group or ungroup an empty tab list");
	}
	return tabIds.length === 1 ? tabIds[0] : (tabIds as [number, ...number[]]);
};

function isRestorableUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

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
	if (tabIds.length === 0) return -1;
	const group = chrome.tabs.group as (options: chrome.tabs.GroupOptions) => Promise<number>;
	const chromeTabIds = toChromeTabIds(tabIds);
	if (groupId !== undefined) {
		return await group({ tabIds: chromeTabIds, groupId });
	}
	return await group({ tabIds: chromeTabIds });
}

export async function updateGroup(
	groupId: number,
	properties: chrome.tabGroups.UpdateProperties,
): Promise<void> {
	if (!isChromeExtension) return;
	await chrome.tabGroups.update(groupId, properties);
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
	if (!isChromeExtension) return;
	if (tabIds.length === 0) return;
	await chrome.tabs.ungroup(toChromeTabIds(tabIds));
}

export async function closeTabs(tabIds: number[]): Promise<void> {
	if (!isChromeExtension) return;
	if (tabIds.length === 0) return;
	await chrome.tabs.remove(tabIds);
}

export async function moveTabToGroup(tabId: number, groupId: number): Promise<void> {
	if (!isChromeExtension) return;
	const group = chrome.tabs.group as (options: chrome.tabs.GroupOptions) => Promise<number>;
	await group({ tabIds: tabId, groupId });
}

export async function restoreStoredTabSet(set: StoredTabSet): Promise<void> {
	if (!isChromeExtension || set.tabs.length === 0) return;
	const currentWindow = await chrome.windows.getCurrent();
	const windowId = currentWindow.id;
	const createdTabIds: number[] = [];
	const failedUrls: string[] = [];
	for (const storedTab of [...set.tabs].sort((a, b) => a.order - b.order)) {
		if (!isRestorableUrl(storedTab.originalUrl)) {
			failedUrls.push(storedTab.originalUrl);
			continue;
		}
		try {
			const created = await chrome.tabs.create({
				windowId,
				url: storedTab.originalUrl,
				active: false,
			});
			if (created.id !== undefined) createdTabIds.push(created.id);
		} catch {
			failedUrls.push(storedTab.originalUrl);
		}
	}
	if (createdTabIds.length === 0) return;
	const groupId = await groupTabs(createdTabIds);
	await updateGroup(groupId, {
		title: set.name,
		color: set.color,
		collapsed: false,
	});
	if (failedUrls.length > 0) {
		throw new Error(
			`Restored ${createdTabIds.length} tabs, skipped ${failedUrls.length} invalid URLs.`,
		);
	}
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
