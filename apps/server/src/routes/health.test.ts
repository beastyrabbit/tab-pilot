import { describe, expect, it, vi } from "vitest";

vi.mock("../services/codex.js", () => ({
	checkCodexHealth: vi.fn().mockReturnValue(false),
}));

const { app } = await import("../app.js");

describe("Health endpoint", () => {
	it("GET /api/health returns status ok with codex field", async () => {
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			status: "ok",
			version: "0.1.0",
			codex: false,
		});
	});
});
