import type { HealthResponse } from "@tab-orga/shared";
import { Hono } from "hono";
import { checkCodexHealth } from "../services/codex.js";
import { getBridgeToken } from "./content-bridge.js";

export const healthRoute = new Hono();

healthRoute.get("/health", async (c) => {
	const codex = await checkCodexHealth();
	const response: HealthResponse & { bridgeToken?: string } = {
		status: "ok",
		version: "0.1.0",
		codex,
		bridgeToken: getBridgeToken(),
	};
	return c.json(response);
});
