import type { ContentDepth } from "./api.js";

export interface ServerSettings {
	model: string;
	contentDepth: ContentDepth;
	port: number;
}

export interface PublicSettings {
	model: string;
	contentDepth: ContentDepth;
}
