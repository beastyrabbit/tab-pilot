import { describe, expect, it, vi } from "vitest";

vi.mock("../services/storage.js", () => {
	let settings = {
		generalPrompt: "",
		groupTitleLength: "medium" as const,
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
		expect(body).toEqual({ generalPrompt: "", groupTitleLength: "medium" });
		expect(body.groupTitleLength).toBe("medium");
	});

	it("PUT /api/settings updates user preferences", async () => {
		const res = await app.request("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ generalPrompt: "Prefer work projects", groupTitleLength: "short" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.generalPrompt).toBe("Prefer work projects");
		expect(body.groupTitleLength).toBe("short");
	});

	it("PUT /api/settings rejects runtime overrides", async () => {
		const res = await app.request("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-4o-mini" }),
		});
		expect(res.status).toBe(400);
	});
});
