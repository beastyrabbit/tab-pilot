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
	const next = groups.filter((item) => item.id !== group.id);
	if (fixed)
		next.push({
			id: group.id,
			title: group.title || "Untitled",
			color: group.color,
			markedAt: new Date().toISOString(),
		});
	await chrome.storage.local.set({ [FIXED_GROUPS_KEY]: next });
	return next;
}

/**
 * Chrome assigns new group ids after a restart, so stored ids go stale. A
 * stale entry moves to the live group with the same title and color, but only
 * when exactly one unclaimed live group matches; the current id is persisted
 * so later steps (like resetting non-fixed groups) see it.
 */
export async function syncFixedGroupIds(
	liveGroups: Array<{ id: number; title?: string; color: string }>,
): Promise<FixedGroup[]> {
	const stored = await getFixedGroups();
	const claimed = new Set(
		stored.filter((fixed) => liveGroups.some((group) => group.id === fixed.id)).map((f) => f.id),
	);
	let changed = false;
	const synced = stored.map((fixed) => {
		if (claimed.has(fixed.id)) return fixed;
		const matches = liveGroups.filter(
			(group) =>
				!claimed.has(group.id) &&
				(group.title || "Untitled") === fixed.title &&
				group.color === fixed.color,
		);
		if (matches.length !== 1) return fixed;
		claimed.add(matches[0].id);
		changed = true;
		return { ...fixed, id: matches[0].id };
	});
	if (changed) await chrome.storage.local.set({ [FIXED_GROUPS_KEY]: synced });
	return synced;
}

export async function resolveFixedGroupIds(groups: Array<{ id: number }>): Promise<Set<number>> {
	const fixedIds = new Set((await getFixedGroups()).map((fixed) => fixed.id));
	return new Set(groups.filter((group) => fixedIds.has(group.id)).map((group) => group.id));
}
