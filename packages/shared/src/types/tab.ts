export interface TabInfo {
	id: number;
	windowId: number;
	url: string;
	title: string;
	favIconUrl?: string;
	groupId: number;
	metaDescription?: string;
	pageText?: string;
}

export type GroupColor =
	| "grey"
	| "blue"
	| "red"
	| "yellow"
	| "green"
	| "pink"
	| "purple"
	| "cyan"
	| "orange";

export interface TabGroupInfo {
	id: number;
	title?: string;
	color: GroupColor;
	collapsed: boolean;
	tabIds: number[];
}
