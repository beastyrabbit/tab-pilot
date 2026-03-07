import { describe, expect, it, vi } from "vitest";

vi.mock("../services/storage.js", () => {
	let settings = {
		model: "gpt-5.3-codex",
		contentDepth: "meta" as const,
		port: 7777,
	};
	return {
		storage: {
			getSettings: () => settings,
			updateSettings: (partial: Record<string, unknown>) => {
				settings = { ...settings, ...partial };
				return settings;
			},
		},
	};
});

// Must import after mock
const { app } = await import("../app.js");

describe("Settings endpoints", () => {
	it("GET /api/settings returns public settings", async () => {
		const res = await app.request("/api/settings");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty("model");
		expect(body).toHaveProperty("contentDepth");
	});

	it("PUT /api/settings updates settings", async () => {
		const res = await app.request("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-4o-mini" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.model).toBe("gpt-4o-mini");
	});
});
