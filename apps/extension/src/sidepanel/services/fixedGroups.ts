export interface FixedGroup {
	id: number;
	title: string;
	color: string;
	markedAt: string;
}

export const FIXED_GROUPS_KEY = "tab-orga-fixed-groups";

export async function getFixedGroups(): Promise<FixedGroup[]> {
	const stored = await chrome.storage.local.get(FIXED_GROUPS_KEY);
	return Array.isArray(stored[FIXED_GROUPS_KEY]) ? (stored[FIXED_GROUPS_KEY] as FixedGroup[]) : [];
}

export async function setFixedGroup(
	group: { id: number; title?: string; color: string },
	fixed: boolean,
): Promise<FixedGroup[]> {
	const groups = await getFixedGroups();
	const title = group.title || "Untitled";
	const next = groups.filter(
		(item) => item.id !== group.id && !(item.title === title && item.color === group.color),
	);
	if (fixed)
		next.push({
			id: group.id,
			title,
			color: group.color,
			markedAt: new Date().toISOString(),
		});
	await chrome.storage.local.set({ [FIXED_GROUPS_KEY]: next });
	return next;
}

/**
 * Chrome assigns new group ids after a restart, so stored ids go stale. Match
 * each fixed group to a live group by id, or by title and color, and persist
 * the current id so later steps (like resetting non-fixed groups) see it.
 */
export async function syncFixedGroupIds(
	liveGroups: Array<{ id: number; title?: string; color: string }>,
): Promise<FixedGroup[]> {
	const stored = await getFixedGroups();
	let changed = false;
	const synced = stored.map((fixed) => {
		if (liveGroups.some((group) => group.id === fixed.id)) return fixed;
		const match = liveGroups.find(
			(group) => (group.title || "Untitled") === fixed.title && group.color === fixed.color,
		);
		if (!match) return fixed;
		changed = true;
		return { ...fixed, id: match.id };
	});
	if (changed) await chrome.storage.local.set({ [FIXED_GROUPS_KEY]: synced });
	return synced;
}

export async function resolveFixedGroupIds(
	groups: Array<{ id: number; title?: string; color: string }>,
): Promise<Set<number>> {
	const fixed = await getFixedGroups();
	return new Set(
		groups
			.filter((group) =>
				fixed.some(
					(item) =>
						item.id === group.id ||
						(item.title === (group.title || "Untitled") && item.color === group.color),
				),
			)
			.map((group) => group.id),
	);
}
