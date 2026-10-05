import type { GroupingSuggestion, PublicSettings, TabGroupInfo, TabInfo } from "@tab-orga/shared";

export interface RunTab {
	id: number;
	windowId: number;
	title: string;
	domain: string;
	groupId: number;
	context: "title-url" | "metadata" | "page-excerpt";
}

export interface RunGroup {
	id: number;
	name: string;
	color: string;
	fixed: boolean;
}

export interface RunProposal {
	at: string;
	kind: "initial" | "refinement" | "apply-selection";
	groups: Array<{ name: string; existingGroupId?: number; tabIds: number[]; confidence: number }>;
	unassignedTabIds: number[];
	warnings: string[];
}

export interface OrganizeRunLog {
	id: string;
	version?: 2;
	startedAt: string;
	finishedAt?: string;
	appliedAt?: string;
	status: "running" | "proposal" | "applied" | "error";
	phase?: "context" | "model" | "proposal" | "refine" | "apply";
	tabCount: number;
	groupCount: number;
	deepContextCount?: number;
	fixedGroupNames?: string[];
	suggestionGroups?: Array<{ name: string; tabCount: number; existing: boolean }>;
	error?: string;
	tabs?: RunTab[];
	groups?: RunGroup[];
	settings?: ReturnType<typeof logSettings>;
	proposals?: RunProposal[];
	outcome?: {
		at: string;
		tabs: Array<{ id: number; groupId: number | null }>;
		groups: Array<{ id: number; name: string; color: string }>;
		closedDuplicateIds: number[];
		warnings: string[];
	};
}

// Explicit allowlist: never serialize the connection key, address or user prompts.
export function logSettings(settings: PublicSettings) {
	return {
		model: settings.model,
		thinking: settings.organizationThinking,
		groupingMode: settings.groupingMode,
		preserveExistingGroups: settings.preserveExistingGroups,
		allowRenameGroups: settings.allowRenameGroups,
		allowAddToExistingGroups: settings.allowAddToExistingGroups,
		allowComplexTitles: settings.allowComplexTitles,
		keepUngroupedTabs: settings.keepUngroupedTabs,
		closeDuplicateTabs: settings.closeDuplicateTabs,
		keepNewestDuplicate: settings.keepNewestDuplicate,
	};
}

export function logText(value: string, secret = ""): string {
	const text = secret ? value.split(secret).join("[redacted]") : value;
	return text
		.replace(/(?:https?:\/\/|www\.)\S+/gi, "[URL omitted]")
		.replace(/\b(?:sk-|Bearer\s+)[\w.-]+/gi, "[redacted]")
		.slice(0, 240);
}

export function snapshotTabs(tabs: TabInfo[], secret = ""): RunTab[] {
	return tabs.map((tab) => {
		let domain = "";
		try {
			const url = new URL(tab.url);
			domain = /^https?:$/.test(url.protocol) ? url.hostname : url.protocol;
		} catch {
			domain = "unavailable";
		}
		return {
			id: tab.id,
			windowId: tab.windowId,
			title: logText(tab.title, secret),
			domain,
			groupId: tab.groupId,
			context: contextKind(tab),
		};
	});
}

export function snapshotGroups(
	groups: TabGroupInfo[],
	fixedIds: Set<number>,
	secret = "",
): RunGroup[] {
	return groups.map((group) => ({
		id: group.id,
		name: logText(group.title || "Untitled", secret),
		color: group.color,
		fixed: fixedIds.has(group.id),
	}));
}

function contextKind(tab: TabInfo): RunTab["context"] {
	if (tab.pageText) return "page-excerpt";
	if (tab.metaDescription) return "metadata";
	return "title-url";
}

/** Warnings about the proposal itself: unknown or repeated tabs, unknown groups, renamed favorites. */
function suggestionWarnings(
	log: OrganizeRunLog,
	suggestion: GroupingSuggestion,
	assigned: Map<number, number | undefined>,
	secret: string,
): string[] {
	const known = new Set(log.tabs?.map((tab) => tab.id));
	const warnings: string[] = [];
	for (const id of suggestion.tabIds) {
		if (!known.has(id)) warnings.push(`Unknown tab ${id} in proposal.`);
		if (assigned.has(id)) warnings.push(`Tab ${id} assigned more than once.`);
		assigned.set(id, suggestion.existingGroupId);
	}
	const target = log.groups?.find((group) => group.id === suggestion.existingGroupId);
	if (suggestion.existingGroupId != null && !target)
		warnings.push(`Unknown target group ${suggestion.existingGroupId}.`);
	if (target?.fixed && target.name !== logText(suggestion.groupName, secret))
		warnings.push(`Favorite ${target.name} would be renamed.`);
	return warnings;
}

/** Tabs the proposal would move out of a favorite (fixed) group. */
function leavingFavoriteWarnings(
	log: OrganizeRunLog,
	assigned: Map<number, number | undefined>,
): string[] {
	const fixedIds = new Set(log.groups?.filter((group) => group.fixed).map((group) => group.id));
	return (log.tabs || [])
		.filter(
			(tab) =>
				fixedIds.has(tab.groupId) && assigned.has(tab.id) && assigned.get(tab.id) !== tab.groupId,
		)
		.map((tab) => `Tab ${tab.id} would leave its favorite group.`);
}

export function recordProposal(
	log: OrganizeRunLog,
	suggestions: GroupingSuggestion[],
	kind: RunProposal["kind"],
	secret = "",
): void {
	const assigned = new Map<number, number | undefined>();
	const warnings = suggestions.flatMap((suggestion) =>
		suggestionWarnings(log, suggestion, assigned, secret),
	);
	const unassignedTabIds = (log.tabs || [])
		.filter((tab) => !assigned.has(tab.id))
		.map((tab) => tab.id);
	warnings.push(...leavingFavoriteWarnings(log, assigned));
	if (log.settings?.groupingMode === "hard" && unassignedTabIds.length)
		warnings.push(`Hard mode: ${unassignedTabIds.length} tabs missing from proposal.`);
	const proposal: RunProposal = {
		at: new Date().toISOString(),
		kind,
		groups: suggestions.map((group) => ({
			name: logText(group.groupName, secret),
			existingGroupId: group.existingGroupId,
			tabIds: [...group.tabIds],
			confidence: group.confidence,
		})),
		unassignedTabIds,
		warnings,
	};
	// Keep the initial proposal and the latest nine revisions/selections.
	const history = [...(log.proposals || []), proposal];
	log.proposals = history.length > 10 ? [history[0], ...history.slice(-9)] : history;
	log.suggestionGroups = proposal.groups.map((group) => ({
		name: group.name,
		tabCount: group.tabIds.length,
		existing: group.existingGroupId != null,
	}));
}

export function recordOutcome(
	log: OrganizeRunLog,
	tabs: Array<{ id?: number; groupId: number }>,
	groups: Array<{ id: number; title?: string; color: string }>,
	expected: Map<number, number>,
	closedDuplicateIds: number[],
	secret = "",
): void {
	const warnings: string[] = [];
	const current = new Map(tabs.map((tab) => [tab.id, tab.groupId]));
	for (const [id, groupId] of expected) {
		if (!closedDuplicateIds.includes(id) && current.get(id) !== groupId)
			warnings.push(
				`Tab ${id}: expected group ${groupId}, observed ${current.get(id) ?? "missing"}.`,
			);
	}
	for (const group of log.groups || []) {
		if (!group.fixed) continue;
		const actual = groups.find((item) => item.id === group.id);
		if (!actual) warnings.push(`Favorite ${group.name} is missing.`);
		else if (
			logText(actual.title || "Untitled", secret) !== group.name ||
			actual.color !== group.color
		)
			warnings.push(`Favorite ${group.name} changed name or color.`);
		for (const tab of (log.tabs || []).filter((item) => item.groupId === group.id)) {
			if (current.get(tab.id) !== group.id)
				warnings.push(`Favorite member ${tab.id} moved or closed.`);
		}
	}
	log.outcome = {
		at: new Date().toISOString(),
		tabs: (log.tabs || []).map((tab) => ({ id: tab.id, groupId: current.get(tab.id) ?? null })),
		groups: groups.map((group) => ({
			id: group.id,
			name: logText(group.title || "Untitled", secret),
			color: group.color,
		})),
		closedDuplicateIds: [...closedDuplicateIds],
		warnings,
	};
}

export const RUN_HISTORY_KEY = "tab-orga-run-history";
let pending: Promise<void> = Promise.resolve();

function enqueue(write: () => Promise<void>): Promise<void> {
	const result = pending.then(write);
	pending = result.catch(() => {});
	return result;
}

export function saveRunLog(log: OrganizeRunLog): Promise<void> {
	const snapshot = structuredClone(log);
	return enqueue(async () => {
		const history = [snapshot, ...(await getRunHistory()).filter((item) => item.id !== snapshot.id)]
			.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
			.slice(0, 20);
		while (
			history.length > 1 &&
			new TextEncoder().encode(JSON.stringify(history)).length > 3_000_000
		)
			history.pop();
		await chrome.storage.local.set({ [RUN_HISTORY_KEY]: history });
	});
}

export async function getRunHistory(): Promise<OrganizeRunLog[]> {
	const stored = await chrome.storage.local.get(RUN_HISTORY_KEY);
	return Array.isArray(stored[RUN_HISTORY_KEY])
		? (stored[RUN_HISTORY_KEY] as OrganizeRunLog[])
		: [];
}

export function clearRunHistory(): Promise<void> {
	return enqueue(() => chrome.storage.local.remove(RUN_HISTORY_KEY));
}
