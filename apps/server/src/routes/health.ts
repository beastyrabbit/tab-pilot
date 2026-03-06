import type { HealthResponse } from "@tab-orga/shared";
import { Hono } from "hono";

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => {
	const response: HealthResponse = {
		status: "ok",
		version: "0.1.0",
	};
	return c.json(response);
});
