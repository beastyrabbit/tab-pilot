import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXED_GROUPS_KEY, setFixedGroup, syncFixedGroupIds } from "./fixedGroups.js";

let store: Record<string, unknown>;

beforeEach(() => {
	store = {};
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: async (key: string) => ({ [key]: store[key] }),
				set: async (items: Record<string, unknown>) => Object.assign(store, items),
			},
		},
	});
});
afterEach(() => vi.unstubAllGlobals());

const fixed = (id: number, title: string, color: string) => ({ id, title, color, markedAt: "" });

describe("syncFixedGroupIds", () => {
	it("moves a stale id to the one live group with the same title and color", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(1, "Streaming", "red")];
		const synced = await syncFixedGroupIds([{ id: 9, title: "Streaming", color: "red" }]);
		expect(synced.map((g) => g.id)).toEqual([9]);
		expect((store[FIXED_GROUPS_KEY] as Array<{ id: number }>)[0].id).toBe(9);
	});

	it("leaves the id alone when the title and color match more than one live group", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(1, "Streaming", "red")];
		const synced = await syncFixedGroupIds([
			{ id: 9, title: "Streaming", color: "red" },
			{ id: 10, title: "Streaming", color: "red" },
		]);
		expect(synced.map((g) => g.id)).toEqual([1]);
	});

	it("does not move a stale id onto a group another fixed entry already owns", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(9, "Streaming", "red"), fixed(1, "Streaming", "red")];
		const synced = await syncFixedGroupIds([{ id: 9, title: "Streaming", color: "red" }]);
		expect(synced.map((g) => g.id)).toEqual([9, 1]);
	});
});

describe("setFixedGroup", () => {
	it("unfixes only the group with that id, even when another has the same title and color", async () => {
		store[FIXED_GROUPS_KEY] = [fixed(9, "Streaming", "red"), fixed(10, "Streaming", "red")];
		const next = await setFixedGroup({ id: 9, title: "Streaming", color: "red" }, false);
		expect(next.map((g) => g.id)).toEqual([10]);
	});
});
