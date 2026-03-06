import type { ContentDepth } from "./api.js";

export interface ServerSettings {
	openaiApiKey: string;
	model: string;
	contentDepth: ContentDepth;
	port: number;
}

export interface PublicSettings {
	model: string;
	contentDepth: ContentDepth;
	hasApiKey: boolean;
}
