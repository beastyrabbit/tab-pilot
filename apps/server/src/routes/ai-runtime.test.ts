import { describe, expect, it, vi } from "vitest";

vi.mock("../services/ai-runtime.js", () => ({
	getAIRuntime: vi.fn().mockResolvedValue({
		provider: "openai-codex",
		authenticated: true,
		roles: {
			lead: { modelId: "gpt-5.6-sol", name: "GPT-5.6 Sol", reasoning: "high" },
			delegates: {
				modelIds: ["gpt-5.6-terra", "gpt-5.6-sol"],
				reasoning: "high",
				policy: "conditional",
				maxConcurrent: 3,
			},
			summaries: {
				modelId: "gpt-5.6-terra",
				name: "GPT-5.6 Terra",
				reasoning: "medium",
			},
		},
		transport: "auto",
		serviceTier: "default",
	}),
}));

const { app } = await import("../app.js");

describe("AI runtime endpoint", () => {
	it("reports the fixed model roles instead of a selectable catalog", async () => {
		const response = await app.request("/api/ai/runtime");
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			provider: "openai-codex",
			authenticated: true,
			roles: {
				lead: { modelId: "gpt-5.6-sol", reasoning: "high" },
				summaries: { modelId: "gpt-5.6-terra", reasoning: "medium" },
			},
		});
	});
});
