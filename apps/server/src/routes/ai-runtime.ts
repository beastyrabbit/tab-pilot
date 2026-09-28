import { Hono } from "hono";
import { getAIRuntime } from "../services/ai-runtime.js";

export const aiRuntimeRoute = new Hono();

aiRuntimeRoute.get("/ai/runtime", async (c) => {
	try {
		return c.json(await getAIRuntime());
	} catch (error) {
		const message = error instanceof Error ? error.message : "AI runtime unavailable";
		console.error(`[ai/runtime] ${message}`);
		return c.json({ error: message }, 503);
	}
});
