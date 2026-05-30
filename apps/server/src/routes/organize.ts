import { zValidator } from "@hono/zod-validator";
import type { OrganizeRequest, OrganizeRun } from "@tab-orga/shared";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { analyzeCorrections, organizeWithAI, refineWithAI } from "../services/codex.js";
import {
	ORGANIZE_DEBUG_LOG_FILE,
	organizeDebugLog,
	stamp,
} from "../services/organize-debug-log.js";
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
	instruction: z.string().max(2000).optional(),
	contentDepth: z.enum(["title-url", "meta", "full"]).optional(),
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

const organizeRuns = new Map<string, OrganizeRun>();
const activeOrganizeRunIdsByWindow = new Map<number, string>();

function runWindowId(run: OrganizeRun): number {
	return run.tabs[0]?.windowId ?? -1;
}

function activeRunForWindow(windowId: number): OrganizeRun | null {
	const runId = activeOrganizeRunIdsByWindow.get(windowId);
	return runId ? organizeRuns.get(runId) || null : null;
}

function firstActiveRun(): OrganizeRun | null {
	for (const runId of activeOrganizeRunIdsByWindow.values()) {
		const run = organizeRuns.get(runId);
		if (run?.status === "running") return run;
	}
	return null;
}

function saveOrganizeRun(run: OrganizeRun): OrganizeRun {
	const next = { ...run, updatedAt: Date.now() };
	const windowId = runWindowId(next);
	organizeRuns.set(next.id, next);
	if (next.status === "running") {
		activeOrganizeRunIdsByWindow.set(windowId, next.id);
	} else if (activeOrganizeRunIdsByWindow.get(windowId) === next.id) {
		activeOrganizeRunIdsByWindow.delete(windowId);
	}
	organizeDebugLog(next.id, `${next.phase}: ${next.message}`, {
		status: next.status,
		elapsedMs: next.updatedAt - next.startedAt,
	});
	return next;
}

function startOrganizeRun(request: OrganizeRequest): OrganizeRun {
	const windowId = request.tabs[0]?.windowId ?? -1;
	const existingActive = activeRunForWindow(windowId);
	if (existingActive?.status === "running") {
		console.log(`[organize-run:${existingActive.id}] Reusing active run`);
		return existingActive;
	}

	const now = Date.now();
	let run: OrganizeRun = {
		id: nanoid(),
		status: "running",
		phase: "queued",
		message: "Queued server organize run",
		startedAt: now,
		updatedAt: now,
		instruction: request.instruction || "",
		tabs: request.tabs,
		groups: request.existingGroups,
		originalGroupIds: request.tabs.map((tab) => [tab.id, tab.groupId]),
	};
	organizeDebugLog(run.id, "run created", {
		logFile: ORGANIZE_DEBUG_LOG_FILE,
		tabs: request.tabs.length,
		groups: request.existingGroups.length,
		groupedTabs: request.tabs.filter((tab) => tab.groupId !== -1).length,
		instruction: request.instruction || "",
	});
	run = saveOrganizeRun(run);

	void (async () => {
		try {
			run = saveOrganizeRun({
				...run,
				phase: "calling-ai",
				message: "Asking AI to organize tabs",
			});
			const result = await organizeWithAI(request, run.id);
			run = saveOrganizeRun({
				...run,
				status: "done",
				phase: "done",
				message: `Ready: ${result.suggestions.length} proposed groups`,
				suggestions: result.suggestions,
				reasoning: result.reasoning,
				storeSuggestions: result.storeSuggestions,
			});
		} catch (error) {
			organizeDebugLog(run.id, "run failed", {
				elapsedMs: Date.now() - run.startedAt,
				error: error instanceof Error ? error.message : String(error),
			});
			run = saveOrganizeRun({
				...run,
				status: "error",
				phase: "error",
				message: "Organize failed",
				error: error instanceof Error ? error.message : String(error),
			});
			console.error(stamp(`[organize-run:${run.id}] Error: ${run.error}`));
		}
	})();

	return run;
}

organizeRoute.post("/organize/runs", zValidator("json", OrganizeRequestSchema), (c) => {
	const body = c.req.valid("json");
	console.log(
		stamp(
			`[organize-run] Start requested: ${body.tabs.length} tabs, ${body.existingGroups.length} groups`,
		),
	);
	const run = startOrganizeRun(body);
	return c.json({ run }, 202);
});

organizeRoute.get("/organize/runs/active", (c) => {
	const windowIdParam = c.req.query("windowId");
	const windowId = windowIdParam === undefined ? undefined : Number(windowIdParam);
	const run =
		typeof windowId === "number" && Number.isFinite(windowId)
			? activeRunForWindow(windowId)
			: firstActiveRun();
	return c.json({ run });
});

organizeRoute.get("/organize/runs/:id", (c) => {
	const run = organizeRuns.get(c.req.param("id")) || null;
	return c.json({ run });
});

organizeRoute.post("/organize", zValidator("json", OrganizeRequestSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		console.log(
			stamp(`[organize] Received ${body.tabs.length} tabs, ${body.existingGroups.length} groups`),
		);
		const result = await organizeWithAI(body, "direct");
		console.log(stamp(`[organize] Success: ${result.suggestions.length} suggestions`));
		return c.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		const stack = e instanceof Error ? e.stack : "";
		console.error(stamp(`[organize] Error: ${message}`));
		if (stack) console.error(stack);
		return c.json({ error: message }, 500);
	}
});

organizeRoute.post("/organize/refine", zValidator("json", RefineRequestSchema), async (c) => {
	try {
		const { suggestions, tabs, feedback, targetGroupName, targetTabId } = c.req.valid("json");
		console.log(
			stamp(`[refine] Feedback: "${feedback}" (group=${targetGroupName}, tab=${targetTabId})`),
		);

		const result = await refineWithAI(suggestions, tabs, feedback, targetGroupName, targetTabId);

		console.log(stamp(`[refine] Success: ${result.suggestions.length} suggestions`));
		return c.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		console.error(stamp(`[refine] Error: ${message}`));
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
