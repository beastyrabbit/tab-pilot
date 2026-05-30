import { zValidator } from "@hono/zod-validator";
import type { PublicSettings } from "@tab-orga/shared";
import { Hono } from "hono";
import { z } from "zod";
import { storage } from "../services/storage.js";

const UpdateSettingsSchema = z.object({
	model: z.string().max(200).optional(),
	contentDepth: z.enum(["title-url", "meta", "full"]).optional(),
	generalPrompt: z.string().max(2000).optional(),
	organizationThinking: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
	summaryThinking: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
	serviceTier: z.enum(["flex", "default", "priority"]).optional(),
	groupTitleLength: z.enum(["short", "medium", "long"]).optional(),
});

export const settingsRoute = new Hono();

function toPublic(settings: ReturnType<typeof storage.getSettings>): PublicSettings {
	return {
		model: settings.model,
		contentDepth: settings.contentDepth,
		generalPrompt: settings.generalPrompt,
		organizationThinking: settings.organizationThinking,
		summaryThinking: settings.summaryThinking,
		serviceTier: settings.serviceTier,
		groupTitleLength: settings.groupTitleLength,
	};
}

settingsRoute.get("/settings", (c) => {
	return c.json(toPublic(storage.getSettings()));
});

settingsRoute.put("/settings", zValidator("json", UpdateSettingsSchema), (c) => {
	const body = c.req.valid("json");
	const update: Record<string, unknown> = {};

	if (body.model !== undefined) update.model = body.model;
	if (body.contentDepth !== undefined) update.contentDepth = body.contentDepth;
	if (body.generalPrompt !== undefined) update.generalPrompt = body.generalPrompt;
	if (body.organizationThinking !== undefined)
		update.organizationThinking = body.organizationThinking;
	if (body.summaryThinking !== undefined) update.summaryThinking = body.summaryThinking;
	if (body.serviceTier !== undefined) update.serviceTier = body.serviceTier;
	if (body.groupTitleLength !== undefined) update.groupTitleLength = body.groupTitleLength;

	return c.json(toPublic(storage.updateSettings(update)));
});
