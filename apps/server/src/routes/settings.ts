import type { PublicSettings } from "@tab-orga/shared";
import { Hono } from "hono";
import { storage } from "../services/storage.js";

export const settingsRoute = new Hono();

settingsRoute.get("/settings", (c) => {
	const settings = storage.getSettings();
	const publicSettings: PublicSettings = {
		model: settings.model,
		contentDepth: settings.contentDepth,
	};
	return c.json(publicSettings);
});

settingsRoute.put("/settings", async (c) => {
	const body = await c.req.json();
	const update: Record<string, unknown> = {};

	if (body.model !== undefined) update.model = body.model;
	if (body.contentDepth !== undefined) update.contentDepth = body.contentDepth;

	const settings = storage.updateSettings(update);
	const publicSettings: PublicSettings = {
		model: settings.model,
		contentDepth: settings.contentDepth,
	};
	return c.json(publicSettings);
});
