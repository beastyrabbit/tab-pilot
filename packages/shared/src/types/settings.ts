import type { ContentDepth } from "./api.js";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ServiceTier = "flex" | "default" | "priority";
export type GroupTitleLength = "short" | "medium" | "long";

export interface ServerSettings {
	model: string;
	/** @deprecated Content depth is ignored. */
	contentDepth: ContentDepth;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
	port: number;
}

export interface PublicSettings {
	model: string;
	/** @deprecated Content depth is ignored. */
	contentDepth: ContentDepth;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
}
