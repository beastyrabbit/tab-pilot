import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { analyzeCorrections, organizeWithAI } from "../services/codex.js";
import { storage } from "../services/storage.js";

const OrganizeRequestSchema = z.object({
	tabs: z.array(
		z.object({
			id: z.number(),
			windowId: z.number(),
			url: z.string(),
			title: z.string(),
			favIconUrl: z.string().optional(),
			groupId: z.number(),
			metaDescription: z.string().optional(),
			pageText: z.string().optional(),
		}),
	),
	existingGroups: z.array(
		z.object({
			id: z.number(),
			title: z.string().optional(),
			color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]),
			collapsed: z.boolean(),
			tabIds: z.array(z.number()),
		}),
	),
	contentDepth: z.enum(["title-url", "meta", "full"]),
});

const LearnRequestSchema = z.object({
	originalSuggestions: z.array(z.any()),
	appliedSuggestions: z.array(z.any()),
	tabs: z.array(z.any()),
});

export const organizeRoute = new Hono();

organizeRoute.post("/organize", zValidator("json", OrganizeRequestSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		const result = await organizeWithAI(body);
		return c.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		return c.json({ error: message }, 500);
	}
});

organizeRoute.post("/organize/learn", zValidator("json", LearnRequestSchema), async (c) => {
	try {
		const { originalSuggestions, appliedSuggestions, tabs } = c.req.valid("json");
		const observations = await analyzeCorrections(originalSuggestions, appliedSuggestions, tabs);

		const memories = storage.getMemories();
		const newMemories = observations.map((observation) => ({
			id: nanoid(),
			observation,
			createdAt: new Date().toISOString(),
			source: "correction" as const,
		}));

		storage.saveMemories([...memories, ...newMemories]);
		return c.json({ learned: newMemories.length });
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		return c.json({ error: message }, 500);
	}
});
