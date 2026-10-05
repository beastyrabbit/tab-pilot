import type { TabInfo } from "@tab-orga/shared";

/**
 * Which copies of a duplicated URL to close. A copy in a protected (fixed)
 * group is never closed; when one exists, the unprotected copies go. Otherwise
 * one copy stays: the most recently used, or the least recently used when
 * keepNewest is off.
 */
export function pickDuplicateTabsToClose(
	tabs: TabInfo[],
	lastAccessed: Map<number, number>,
	keepNewest: boolean,
	isProtected: (tabId: number) => boolean,
): number[] {
	const byUrl = new Map<string, TabInfo[]>();
	for (const tab of tabs) {
		const key = tab.url.trim();
		byUrl.set(key, [...(byUrl.get(key) ?? []), tab]);
	}
	return [...byUrl.values()]
		.filter((copies) => copies.length > 1)
		.flatMap((copies) => closableCopies(copies, lastAccessed, keepNewest, isProtected));
}

function closableCopies(
	copies: TabInfo[],
	lastAccessed: Map<number, number>,
	keepNewest: boolean,
	isProtected: (tabId: number) => boolean,
): number[] {
	const ordered = [...copies].sort(
		(a, b) => (lastAccessed.get(a.id) ?? 0) - (lastAccessed.get(b.id) ?? 0),
	);
	if (ordered.some((tab) => isProtected(tab.id))) {
		return ordered.filter((tab) => !isProtected(tab.id)).map((tab) => tab.id);
	}
	const kept = keepNewest ? ordered.at(-1) : ordered[0];
	return ordered.filter((tab) => tab !== kept).map((tab) => tab.id);
}
