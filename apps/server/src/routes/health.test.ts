import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("Health endpoint", () => {
	it("GET /api/health returns status ok", async () => {
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			status: "ok",
			version: "0.1.0",
		});
	});
});
