import { Hono } from "hono";
import { fetchModels } from "../services/openai.js";
import { storage } from "../services/storage.js";

export const modelsRoute = new Hono();

modelsRoute.get("/models", async (c) => {
	try {
		const models = await fetchModels();
		const settings = storage.getSettings();
		return c.json({ models, current: settings.model });
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		return c.json({ error: message }, 500);
	}
});
