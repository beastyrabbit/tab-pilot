import type { TabInfo } from "@tab-orga/shared";
import { describe, expect, it } from "vitest";
import { pickDuplicateTabsToClose } from "./duplicates.js";

const tab = (id: number, url: string): TabInfo => ({
	id,
	url,
	title: url,
	windowId: 1,
	groupId: -1,
});
const tabs = [
	tab(1, "https://a.test/"),
	tab(2, "https://a.test/"),
	tab(3, "https://a.test/"),
	tab(4, "https://b.test/"),
];
// Tab 2 was used most recently, tab 1 least recently.
const lastAccessed = new Map([
	[1, 10],
	[2, 30],
	[3, 20],
]);
const none = () => false;

describe("pickDuplicateTabsToClose", () => {
	it("keeps the most recently used copy when keeping the newest", () => {
		expect(pickDuplicateTabsToClose(tabs, lastAccessed, true, none)).toEqual([1, 3]);
	});

	it("keeps the least recently used copy otherwise", () => {
		expect(pickDuplicateTabsToClose(tabs, lastAccessed, false, none)).toEqual([3, 2]);
	});

	it("never closes a copy in a fixed group and closes the unprotected copies instead", () => {
		expect(pickDuplicateTabsToClose(tabs, lastAccessed, true, (id) => id === 1)).toEqual([3, 2]);
	});
});
