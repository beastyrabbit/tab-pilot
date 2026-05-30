import { describe, expect, it, vi } from "vitest";

vi.mock("../services/storage.js", () => {
	let settings = {
		model: "gpt-5.3-codex",
		contentDepth: "meta" as const,
		generalPrompt: "",
		organizationThinking: "xhigh" as const,
		summaryThinking: "medium" as const,
		serviceTier: "default" as const,
		groupTitleLength: "medium" as const,
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
		expect(body.organizationThinking).toBe("xhigh");
		expect(body.summaryThinking).toBe("medium");
		expect(body.serviceTier).toBe("default");
		expect(body.groupTitleLength).toBe("medium");
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

	it("PUT /api/settings updates thinking and speed settings", async () => {
		const res = await app.request("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				organizationThinking: "high",
				summaryThinking: "low",
				serviceTier: "priority",
				groupTitleLength: "short",
			}),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.organizationThinking).toBe("high");
		expect(body.summaryThinking).toBe("low");
		expect(body.serviceTier).toBe("priority");
		expect(body.groupTitleLength).toBe("short");
	});
});
