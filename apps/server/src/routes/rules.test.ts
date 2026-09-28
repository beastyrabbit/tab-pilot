import { describe, expect, it, vi } from "vitest";

let rulesStore: unknown[] = [];

vi.mock("../services/storage.js", () => ({
	storage: {
		getRules: () => rulesStore,
		saveRules: (rules: unknown[]) => {
			rulesStore = rules;
		},
		getSettings: () => ({ generalPrompt: "", groupTitleLength: "medium" }),
		getMemories: () => [],
		saveMemories: () => {},
	},
}));

const { app } = await import("../app.js");

describe("Rules endpoints", () => {
	it("GET /api/rules returns empty array initially", async () => {
		rulesStore = [];
		const res = await app.request("/api/rules");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	it("POST /api/rules creates a new rule", async () => {
		rulesStore = [];
		const res = await app.request("/api/rules", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				pattern: "github.com",
				matchType: "domain",
				targetGroup: "Development",
			}),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.pattern).toBe("github.com");
		expect(body.targetGroup).toBe("Development");
		expect(body.id).toBeDefined();
	});

	it("DELETE /api/rules/:id removes a rule", async () => {
		rulesStore = [
			{
				id: "test-id",
				pattern: "test",
				matchType: "domain",
				targetGroup: "Test",
				enabled: true,
				createdAt: "2024-01-01",
			},
		];
		const res = await app.request("/api/rules/test-id", { method: "DELETE" });
		expect(res.status).toBe(200);
		expect(rulesStore).toEqual([]);
	});
});
