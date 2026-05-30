import type {
	GroupingSuggestion,
	StoredTabSetSuggestion,
	TabGroupInfo,
	TabInfo,
} from "@tab-orga/shared";

export const ORGANIZE_RUN_KEY = "tabOrganizeRun";

export type OrganizeRunPhase =
	| "queued"
	| "starting-stage1"
	| "checking-cache"
	| "reading-metadata"
	| "calling-ai"
	| "done"
	| "error";

export interface StoredOrganizeRun {
	id: string;
	status: "running" | "done" | "error";
	phase: OrganizeRunPhase;
	message: string;
	startedAt: number;
	updatedAt: number;
	instruction: string;
	tabs: TabInfo[];
	groups: TabGroupInfo[];
	originalGroupIds: Array<[number, number]>;
	suggestions?: GroupingSuggestion[];
	reasoning?: string;
	storeSuggestions?: StoredTabSetSuggestion[];
	error?: string;
}

export interface OrganizeRunRequest {
	tabs: TabInfo[];
	groups: TabGroupInfo[];
	instruction: string;
	runId?: string;
}

export function createStoredOrganizeRun({
	tabs,
	groups,
	instruction,
	runId = `organize-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}: OrganizeRunRequest): StoredOrganizeRun {
	const now = Date.now();
	return {
		id: runId,
		status: "running",
		phase: "queued",
		message: "Queued organize run",
		startedAt: now,
		updatedAt: now,
		instruction,
		tabs,
		groups,
		originalGroupIds: tabs.map((tab) => [tab.id, tab.groupId]),
	};
}

export async function getStoredOrganizeRun(): Promise<StoredOrganizeRun | null> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
	const result = await chrome.storage.local.get(ORGANIZE_RUN_KEY);
	return (result[ORGANIZE_RUN_KEY] as StoredOrganizeRun | undefined) || null;
}

export async function saveStoredOrganizeRun(run: StoredOrganizeRun): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({ [ORGANIZE_RUN_KEY]: run });
}

export async function clearStoredOrganizeRun(): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.remove(ORGANIZE_RUN_KEY);
}
