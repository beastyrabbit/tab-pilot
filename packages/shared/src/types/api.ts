import type { GroupColor, TabGroupInfo, TabInfo } from "./tab.js";

export interface OrganizeRequest {
	tabs: TabInfo[];
	existingGroups: TabGroupInfo[];
	instruction?: string;
}

export type GroupingBasis = "rule" | "project" | "topic" | "site";

export interface GroupingSuggestion {
	groupName: string;
	color: GroupColor;
	tabIds: number[];
	existingGroupId?: number;
	isNew: boolean;
	confidence: number;
	basis?: GroupingBasis;
	rationale?: string;
}

export interface UngroupedTabReason {
	tabId: number;
	reason: string;
}

export interface StoredTabSetSuggestion {
	setId: string;
	setName: string;
	tabIds: number[];
	confidence: "low" | "medium" | "high";
	reason: string;
}

export interface OrganizeResponse {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	storeSuggestions: StoredTabSetSuggestion[];
	ungrouped?: UngroupedTabReason[];
}

export type OrganizeRunPhase =
	| "queued"
	| "starting-stage1"
	| "checking-cache"
	| "reading-metadata"
	| "calling-ai"
	| "done"
	| "error";

export interface OrganizeRun {
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
	ungrouped?: UngroupedTabReason[];
	error?: string;
}

export interface StartOrganizeRunResponse {
	run: OrganizeRun;
}

export interface GetOrganizeRunResponse {
	run: OrganizeRun | null;
}

export interface HealthResponse {
	status: "ok";
	version: string;
	codex: boolean;
}

export interface ErrorResponse {
	error: string;
	details?: string;
}

export interface RefineRequest {
	suggestions: GroupingSuggestion[];
	tabs: TabInfo[];
	feedback: string;
	targetGroupName?: string;
	targetTabId?: number;
}

export interface RefineResponse {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	ungrouped?: UngroupedTabReason[];
	memoryCandidates: MemoryCandidate[];
	/** @deprecated Use memoryCandidates. */
	memories?: string[];
	memoryChecks?: MemoryCheck[];
	storeSuggestions: StoredTabSetSuggestion[];
}

export interface MemoryCandidate {
	observation: string;
	reason: string;
}

export interface MemoryCheck {
	memoryId: string;
	status: "followed" | "not_applicable" | "ignored";
	reason: string;
}

export interface AIEditMemoriesRequest {
	instruction: string;
}

export interface AIEditMemoriesResponse {
	memories: Array<{ id: string; observation: string }>;
	summary: string;
}

export interface AIRuntimeResponse {
	provider: "openai-codex";
	authenticated: boolean;
	roles: {
		lead: { modelId: "gpt-5.6-sol"; name: string; reasoning: "high" };
		delegates: {
			modelIds: ["gpt-5.6-terra", "gpt-5.6-sol"];
			reasoning: "high";
			policy: "conditional";
			maxConcurrent: 3;
		};
		summaries: { modelId: "gpt-5.6-terra"; name: string; reasoning: "medium" };
	};
	transport: "auto";
	serviceTier: "default";
}

export interface TabSemanticProfile {
	summary: string;
	subjects: string[];
	activity: string;
	namedEntities: string[];
	confidence: number;
	needsMoreEvidence: boolean;
}

export interface TabSemanticProfileResult extends TabSemanticProfile {
	tabId: number;
}

export interface TabSummarySnapshot {
	stage1Summary?: string;
	stage2Summary?: string;
}

export interface StoredTabMetadata {
	metaDescription?: string;
	ogDescription?: string;
	keywords?: string;
}

export interface StoredTabInput extends TabSummarySnapshot {
	originalUrl: string;
	title: string;
	favIconUrl?: string;
	metadata?: StoredTabMetadata;
}

export interface StoredTab extends StoredTabInput {
	id: string;
	setId: string;
	normalizedUrl: string;
	order: number;
	createdAt: string;
}

export interface StoredTabSetSummary {
	id: string;
	name: string;
	color: GroupColor;
	summary: string;
	keywords: string[];
	domains: string[];
	tabCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface StoredTabSet extends StoredTabSetSummary {
	tabs: StoredTab[];
}

export interface CreateStoredTabSetRequest {
	name: string;
	color?: GroupColor;
	summary?: string;
	tabs: StoredTabInput[];
}

export interface AppendStoredTabsRequest {
	tabs: StoredTabInput[];
}
