import { zValidator } from "@hono/zod-validator";
import type { PublicSettings } from "@tab-orga/shared";
import { Hono } from "hono";
import { z } from "zod";
import { storage } from "../services/storage.js";

const UpdateSettingsSchema = z
	.object({
		generalPrompt: z.string().max(2000).optional(),
		groupTitleLength: z.enum(["short", "medium", "long"]).optional(),
	})
	.strict();

export const settingsRoute = new Hono();

function toPublic(settings: ReturnType<typeof storage.getSettings>): PublicSettings {
	return {
		generalPrompt: settings.generalPrompt,
		groupTitleLength: settings.groupTitleLength,
	};
}

settingsRoute.get("/settings", (c) => {
	return c.json(toPublic(storage.getSettings()));
});

settingsRoute.put("/settings", zValidator("json", UpdateSettingsSchema), (c) => {
	const body = c.req.valid("json");
	const update: Record<string, unknown> = {};

	if (body.generalPrompt !== undefined) update.generalPrompt = body.generalPrompt;
	if (body.groupTitleLength !== undefined) update.groupTitleLength = body.groupTitleLength;

	return c.json(toPublic(storage.updateSettings(update)));
});
