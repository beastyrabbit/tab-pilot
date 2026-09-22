export type GroupTitleLength = "short" | "medium" | "long";

export interface ServerSettings {
	generalPrompt: string;
	groupTitleLength: GroupTitleLength;
}

export type PublicSettings = ServerSettings;
