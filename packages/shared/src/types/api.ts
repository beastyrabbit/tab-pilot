import type { GroupColor, TabGroupInfo, TabInfo } from "./tab.js";

export type ContentDepth = "title-url" | "meta" | "full";

export interface OrganizeRequest {
	tabs: TabInfo[];
	existingGroups: TabGroupInfo[];
	contentDepth: ContentDepth;
}

export interface GroupingSuggestion {
	groupName: string;
	color: GroupColor;
	tabIds: number[];
	existingGroupId?: number;
	isNew: boolean;
	confidence: number;
}

export interface OrganizeResponse {
	suggestions: GroupingSuggestion[];
	reasoning: string;
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
	memories: string[];
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
