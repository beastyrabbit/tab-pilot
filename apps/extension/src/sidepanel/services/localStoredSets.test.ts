import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendStoredTabs, createStoredSet, getStoredSet } from "./localStoredSets.js";

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

const tab = (originalUrl: string) => ({ originalUrl, title: originalUrl });

describe("stored tab sets", () => {
	it("keeps fragment routes apart but skips trailing-slash duplicates", async () => {
		const set = await createStoredSet({
			name: "Mail",
			color: "blue",
			tabs: [
				tab("https://mail.test/#/inbox"),
				tab("https://mail.test/#/sent"),
				tab("https://docs.test/page"),
				tab("https://docs.test/page/"),
			],
		});
		expect(set.tabs.map((t) => t.originalUrl)).toEqual([
			"https://mail.test/#/inbox",
			"https://mail.test/#/sent",
			"https://docs.test/page",
		]);
	});

	it("does not append a page the set already holds", async () => {
		const set = await createStoredSet({
			name: "Docs",
			color: "grey",
			tabs: [tab("https://docs.test/a")],
		});
		await appendStoredTabs(set.id, [tab("https://docs.test/a/"), tab("https://docs.test/b")]);
		const stored = await getStoredSet(set.id);
		expect(stored?.tabs.map((t) => t.originalUrl)).toEqual([
			"https://docs.test/a",
			"https://docs.test/b",
		]);
		expect(stored?.tabCount).toBe(2);
	});
});
