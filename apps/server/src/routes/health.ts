import type { HealthResponse } from "@tab-orga/shared";
import { Hono } from "hono";
import { checkCodexHealth } from "../services/codex.js";

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => {
	const codex = checkCodexHealth();
	const response: HealthResponse = {
		status: "ok",
		version: "0.1.0",
		codex,
	};
	return c.json(response);
});
