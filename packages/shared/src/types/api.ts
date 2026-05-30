import type { GroupColor, TabGroupInfo, TabInfo } from "./tab.js";

export type ContentDepth = "title-url" | "meta" | "full";

export interface OrganizeRequest {
	tabs: TabInfo[];
	existingGroups: TabGroupInfo[];
	instruction?: string;
	/** @deprecated Content depth is ignored. Metadata and cached summaries are always used. */
	contentDepth?: ContentDepth;
}

export interface GroupingSuggestion {
	groupName: string;
	color: GroupColor;
	tabIds: number[];
	existingGroupId?: number;
	isNew: boolean;
	confidence: number;
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
	error?: string;
}

export interface StartOrganizeRunResponse {
	run: OrganizeRun;
}

export interface GetOrganizeRunResponse {
	run: OrganizeRun | null;
}

export interface LearnRequest {
	originalSuggestions: GroupingSuggestion[];
	appliedSuggestions: GroupingSuggestion[];
	tabs: TabInfo[];
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

export interface ModelsResponse {
	models: ModelInfo[];
	current: string;
}

export interface ModelInfo {
	id: string;
	name: string;
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
