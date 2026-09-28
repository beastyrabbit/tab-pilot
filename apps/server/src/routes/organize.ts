import { zValidator } from "@hono/zod-validator";
import type { OrganizeRequest, OrganizeRun } from "@tab-orga/shared";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organizeWithAI, refineWithAI } from "../services/codex.js";
import {
	ORGANIZE_DEBUG_LOG_FILE,
	organizeDebugLog,
	stamp,
} from "../services/organize-debug-log.js";

const OrganizeRequestSchema = z
	.object({
		tabs: z
			.array(
				z.object({
					id: z.number(),
					windowId: z.number(),
					url: z.string().max(10_000),
					title: z.string().max(2_000),
					favIconUrl: z.string().optional(),
					groupId: z.number(),
					metaDescription: z.string().optional(),
					pageText: z.string().max(100_000).optional(),
				}),
			)
			.max(500),
		existingGroups: z
			.array(
				z.object({
					id: z.number(),
					title: z.string().optional(),
					color: z.enum([
						"grey",
						"blue",
						"red",
						"yellow",
						"green",
						"pink",
						"purple",
						"cyan",
						"orange",
					]),
					collapsed: z.boolean(),
					tabIds: z.array(z.number()).max(500),
				}),
			)
			.max(200),
		instruction: z.string().max(2000).optional(),
	})
	.strict();

const GroupingSuggestionSchema = z
	.object({
		groupName: z.string().min(1).max(200),
		color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]),
		tabIds: z.array(z.number()).max(500),
		existingGroupId: z.preprocess((v) => (v === null ? undefined : v), z.number().optional()),
		isNew: z.boolean(),
		confidence: z.number().min(0).max(1),
		basis: z.enum(["rule", "project", "topic", "site"]).optional(),
		rationale: z.string().max(500).optional(),
	})
	.strict();

const TabInfoSchema = z
	.object({
		id: z.number(),
		windowId: z.number(),
		url: z.string().max(10_000),
		title: z.string().max(2_000),
		favIconUrl: z.string().optional(),
		groupId: z.number(),
		metaDescription: z.string().optional(),
		pageText: z.string().max(100_000).optional(),
	})
	.strict();

const RefineRequestSchema = z.object({
	suggestions: z.array(GroupingSuggestionSchema).max(200),
	tabs: z.array(TabInfoSchema).max(500),
	feedback: z.string().min(1).max(2000),
	targetGroupName: z.string().optional(),
	targetTabId: z.number().optional(),
});

export const organizeRoute = new Hono();

const organizeRuns = new Map<string, OrganizeRun>();
const activeOrganizeRunIdsByWindow = new Map<number, string>();
const COMPLETED_RUN_TTL_MS = 30 * 60 * 1000;
const MAX_RETAINED_RUNS = 100;

function pruneOrganizeRuns(): void {
	const now = Date.now();
	for (const [id, run] of organizeRuns) {
		if (run.status !== "running" && now - run.updatedAt > COMPLETED_RUN_TTL_MS) {
			organizeRuns.delete(id);
		}
	}
	if (organizeRuns.size <= MAX_RETAINED_RUNS) return;
	const removable = [...organizeRuns.values()]
		.filter((run) => run.status !== "running")
		.sort((a, b) => a.updatedAt - b.updatedAt);
	for (const run of removable) {
		if (organizeRuns.size <= MAX_RETAINED_RUNS) break;
		organizeRuns.delete(run.id);
	}
}

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
	pruneOrganizeRuns();
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
				ungrouped: result.ungrouped,
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
	pruneOrganizeRuns();
	const windowIdParam = c.req.query("windowId");
	const windowId = windowIdParam === undefined ? undefined : Number(windowIdParam);
	const run =
		typeof windowId === "number" && Number.isFinite(windowId)
			? activeRunForWindow(windowId)
			: firstActiveRun();
	return c.json({ run });
});

organizeRoute.get("/organize/runs/:id", (c) => {
	pruneOrganizeRuns();
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
