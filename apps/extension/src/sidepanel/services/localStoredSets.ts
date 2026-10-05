import type { StoredTabInput, StoredTabSet, StoredTabSetSummary } from "@tab-orga/shared";

const KEY = "tab-orga-stored-sets";
async function read(): Promise<StoredTabSet[]> {
	const r = await chrome.storage.local.get(KEY);
	return (r[KEY] as StoredTabSet[] | undefined) ?? [];
}
async function write(sets: StoredTabSet[]) {
	await chrome.storage.local.set({ [KEY]: sets });
}
/** Same page, ignoring the fragment and a trailing slash, so variants are not stored twice. */
function normalizeUrl(raw: string): string {
	try {
		const url = new URL(raw);
		url.hash = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return raw;
	}
}

function uniqueTabs(tabs: StoredTabInput[], seen = new Set<string>()): StoredTabInput[] {
	return tabs.filter((tab) => {
		const key = normalizeUrl(tab.originalUrl);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function listStoredSets(): Promise<StoredTabSetSummary[]> {
	return (await read()).map(({ tabs, ...s }) => s);
}
export async function createStoredSet(input: {
	name: string;
	color: StoredTabSet["color"];
	tabs: StoredTabInput[];
}): Promise<StoredTabSet> {
	const sets = await read();
	const now = Date.now();
	const setId = crypto.randomUUID();
	input = { ...input, tabs: uniqueTabs(input.tabs) };
	const set: StoredTabSet = {
		id: setId,
		name: input.name,
		color: input.color,
		tabs: input.tabs.map((t, i) => ({
			...t,
			id: crypto.randomUUID(),
			setId: setId,
			normalizedUrl: normalizeUrl(t.originalUrl),
			order: i,
			createdAt: new Date(now).toISOString(),
		})),
		keywords: [],
		tabCount: input.tabs.length,
		domains: [
			...new Set(
				input.tabs
					.map((t) => {
						try {
							return new URL(t.originalUrl).hostname;
						} catch {
							return "";
						}
					})
					.filter(Boolean),
			),
		],
		summary: `${input.tabs.length} tabs`,
		createdAt: new Date(now).toISOString(),
		updatedAt: new Date(now).toISOString(),
	};
	await write([set, ...sets]);
	return set;
}
export async function appendStoredTabs(id: string, tabs: StoredTabInput[]) {
	const sets = await read();
	const set = sets.find((s) => s.id === id);
	if (!set) throw new Error("Stored set not found");
	const added = uniqueTabs(tabs, new Set(set.tabs.map((t) => normalizeUrl(t.originalUrl))));
	set.tabs = [
		...set.tabs,
		...added.map((t, i) => ({
			...t,
			id: crypto.randomUUID(),
			setId: id,
			normalizedUrl: normalizeUrl(t.originalUrl),
			order: set.tabs.length + i,
			createdAt: new Date().toISOString(),
		})),
	];
	set.tabCount = set.tabs.length;
	set.keywords = [];
	set.updatedAt = new Date().toISOString();
	set.domains = [
		...new Set(
			set.tabs
				.map((t) => {
					try {
						return new URL(t.originalUrl).hostname;
					} catch {
						return "";
					}
				})
				.filter(Boolean),
		),
	];
	await write(sets);
	return set;
}
export async function getStoredSet(id: string) {
	return (await read()).find((s) => s.id === id) ?? null;
}
export async function deleteStoredSet(id: string) {
	await write((await read()).filter((s) => s.id !== id));
}
