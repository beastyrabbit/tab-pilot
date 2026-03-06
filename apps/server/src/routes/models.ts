import { Hono } from "hono";
import { getAvailableModels } from "../services/codex.js";
import { storage } from "../services/storage.js";

export const modelsRoute = new Hono();

modelsRoute.get("/models", async (c) => {
	try {
		const models = await getAvailableModels();
		const settings = storage.getSettings();
		return c.json({ models, current: settings.model });
	} catch {
		const settings = storage.getSettings();
		return c.json({ models: [], current: settings.model });
	}
});
