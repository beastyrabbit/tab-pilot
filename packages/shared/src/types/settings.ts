import type { ContentDepth } from "./api.js";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ServiceTier = "flex" | "default" | "priority";
export type GroupTitleLength = "short" | "medium" | "long";
export type GroupingMode = "soft" | "hard";

export interface ServerSettings {
	provider: "cliproxy";
	proxyUrl: string;
	proxyApiKey: string;
	model: string;
	/** @deprecated Content depth is ignored. */
	contentDepth: ContentDepth;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
	groupingMode: GroupingMode;
	preserveExistingGroups: boolean;
	allowRenameGroups: boolean;
	allowComplexTitles: boolean;
	allowAddToExistingGroups: boolean;
	keepUngroupedTabs: boolean;
	closeDuplicateTabs: boolean;
	keepNewestDuplicate: boolean;
	port: number;
}

export interface PublicSettings {
	provider: "cliproxy";
	proxyUrl: string;
	proxyApiKey: string;
	model: string;
	/** @deprecated Content depth is ignored. */
	contentDepth: ContentDepth;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
	groupingMode: GroupingMode;
	preserveExistingGroups: boolean;
	allowRenameGroups: boolean;
	allowComplexTitles: boolean;
	allowAddToExistingGroups: boolean;
	keepUngroupedTabs: boolean;
	closeDuplicateTabs: boolean;
	keepNewestDuplicate: boolean;
}
