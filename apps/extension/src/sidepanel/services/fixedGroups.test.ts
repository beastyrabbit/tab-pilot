import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXED_GROUPS_KEY, setFixedGroup, syncFixedGroupIds } from "./fixedGroups.js";

let store: Record<string, unknown>;
/** Live tab groups across every window, as chrome.tabGroups.query({}) returns them. */
let live: Array<{ id: number; title?: string; color: string }>;

beforeEach(() => {
	store = {};
	live = [];
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: async (key: string) => ({ [key]: store[key] }),
				set: async (items: Record<string, unknown>) => Object.assign(store, items),
			},
		},
		tabGroups: { query: async () => live },
	});
});
afterEach(() => vi.unstubAllGlobals());

const fixed = (id: number, title: string, color: string) => ({ id, title, color, markedAt: "" });
const group = (id: number, title: string, color: string) => ({ id, title, color });

describe("syncFixedGroupIds", () => {
	it("moves a stale id to the one live group with the same title and color", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(1, "Streaming", "red")];
		live = [group(9, "Streaming", "red")];
		expect((await syncFixedGroupIds()).map((g) => g.id)).toEqual([9]);
		expect((store[FIXED_GROUPS_KEY] as Array<{ id: number }>)[0].id).toBe(9);
	});

	it("leaves the id alone when the title and color match more than one live group", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(1, "Streaming", "red")];
		live = [group(9, "Streaming", "red"), group(10, "Streaming", "red")];
		expect((await syncFixedGroupIds()).map((g) => g.id)).toEqual([1]);
	});

	it("does not move a record onto a group another fixed record already owns in another window", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(10, "Streaming", "red"), fixed(1, "Streaming", "red")];
		live = [group(9, "Streaming", "red"), group(10, "Streaming", "red")];
		// 10 is live in another window; 1 is stale and has exactly one unclaimed match left.
		expect((await syncFixedGroupIds()).map((g) => g.id)).toEqual([10, 9]);
	});
});

describe("setFixedGroup", () => {
	it("keeps a same-title fixed group in another window when unfixing one", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(9, "Streaming", "red"), fixed(10, "Streaming", "red")];
		live = [group(9, "Streaming", "red"), group(10, "Streaming", "red")];
		const next = await setFixedGroup({ id: 9, title: "Streaming", color: "red" }, false);
		expect(next.map((g) => g.id)).toEqual([10]);
	});

	it("drops stale same-title records on unfix so a later sync cannot re-fix the group", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(9, "Streaming", "red"), fixed(1, "Streaming", "red")];
		live = [group(9, "Streaming", "red")];
		await setFixedGroup({ id: 9, title: "Streaming", color: "red" }, false);
		expect(await syncFixedGroupIds()).toEqual([]);
	});
});
