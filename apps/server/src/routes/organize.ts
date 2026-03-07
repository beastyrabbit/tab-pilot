import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { analyzeCorrections, organizeWithAI, refineWithAI } from "../services/codex.js";
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

const GroupingSuggestionSchema = z.object({
	groupName: z.string(),
	color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]),
	tabIds: z.array(z.number()),
	existingGroupId: z.preprocess((v) => (v === null ? undefined : v), z.number().optional()),
	isNew: z.boolean(),
	confidence: z.number(),
});

const TabInfoSchema = z.object({
	id: z.number(),
	windowId: z.number(),
	url: z.string(),
	title: z.string(),
	favIconUrl: z.string().optional(),
	groupId: z.number(),
	metaDescription: z.string().optional(),
	pageText: z.string().optional(),
});

const RefineRequestSchema = z.object({
	suggestions: z.array(GroupingSuggestionSchema),
	tabs: z.array(TabInfoSchema),
	feedback: z.string().min(1),
	targetGroupName: z.string().optional(),
	targetTabId: z.number().optional(),
});

const LearnRequestSchema = z.object({
	originalSuggestions: z.array(GroupingSuggestionSchema),
	appliedSuggestions: z.array(GroupingSuggestionSchema),
	tabs: z.array(TabInfoSchema),
});

export const organizeRoute = new Hono();

organizeRoute.post("/organize", zValidator("json", OrganizeRequestSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		console.log(
			`[organize] Received ${body.tabs.length} tabs, ${body.existingGroups.length} groups, depth=${body.contentDepth}`,
		);
		const result = await organizeWithAI(body);
		console.log(`[organize] Success: ${result.suggestions.length} suggestions`);
		return c.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		const stack = e instanceof Error ? e.stack : "";
		console.error(`[organize] Error: ${message}`);
		if (stack) console.error(stack);
		return c.json({ error: message }, 500);
	}
});

organizeRoute.post("/organize/refine", zValidator("json", RefineRequestSchema), async (c) => {
	try {
		const { suggestions, tabs, feedback, targetGroupName, targetTabId } = c.req.valid("json");
		console.log(`[refine] Feedback: "${feedback}" (group=${targetGroupName}, tab=${targetTabId})`);

		const result = await refineWithAI(suggestions, tabs, feedback, targetGroupName, targetTabId);

		// Save any new memories
		if (result.memories.length > 0) {
			const existing = storage.getMemories();
			const newMemories = result.memories.map((observation) => ({
				id: nanoid(),
				observation,
				createdAt: new Date().toISOString(),
				source: "correction" as const,
			}));
			storage.saveMemories([...existing, ...newMemories]);
			console.log(`[refine] Saved ${newMemories.length} new memories`);
		}

		console.log(`[refine] Success: ${result.suggestions.length} suggestions`);
		return c.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		console.error(`[refine] Error: ${message}`);
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
