import type { PublicSettings } from "@tab-orga/shared";
import { Hono } from "hono";
import { storage } from "../services/storage.js";

export const settingsRoute = new Hono();

function toPublic(settings: ReturnType<typeof storage.getSettings>): PublicSettings {
	return {
		model: settings.model,
		contentDepth: settings.contentDepth,
		generalPrompt: settings.generalPrompt,
	};
}

settingsRoute.get("/settings", (c) => {
	return c.json(toPublic(storage.getSettings()));
});

settingsRoute.put("/settings", async (c) => {
	const body = await c.req.json();
	const update: Record<string, unknown> = {};

	if (body.model !== undefined) update.model = body.model;
	if (body.contentDepth !== undefined) update.contentDepth = body.contentDepth;
	if (body.generalPrompt !== undefined) update.generalPrompt = body.generalPrompt;

	return c.json(toPublic(storage.updateSettings(update)));
});
