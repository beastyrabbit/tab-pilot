export type RuleMatchType = "url-contains" | "domain" | "title-contains" | "regex";

export interface UserRule {
	id: string;
	pattern: string;
	matchType: RuleMatchType;
	targetGroup: string;
	color?: string;
	enabled: boolean;
	createdAt: string;
}

export type MemorySource = "correction" | "pattern";

export interface AIMemory {
	id: string;
	observation: string;
	createdAt: string;
	source: MemorySource;
}
