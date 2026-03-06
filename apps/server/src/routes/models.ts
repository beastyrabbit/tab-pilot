import { Hono } from "hono";
import { storage } from "../services/storage.js";

export const modelsRoute = new Hono();

const AVAILABLE_MODELS = [
	{ id: "o3", name: "o3" },
	{ id: "o4-mini", name: "o4-mini" },
	{ id: "gpt-4.1", name: "gpt-4.1" },
	{ id: "gpt-4.1-mini", name: "gpt-4.1-mini" },
	{ id: "gpt-4.1-nano", name: "gpt-4.1-nano" },
	{ id: "gpt-4o", name: "gpt-4o" },
	{ id: "gpt-4o-mini", name: "gpt-4o-mini" },
];

modelsRoute.get("/models", (c) => {
	const settings = storage.getSettings();
	return c.json({ models: AVAILABLE_MODELS, current: settings.model });
});
