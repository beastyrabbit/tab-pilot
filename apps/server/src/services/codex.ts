import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Agent, type AgentTool, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
	type Api,
	type Context,
	clampThinkingLevel,
	getModel,
	getModels,
	type ImageContent,
	type Model,
	type OAuthCredentials,
	type SimpleStreamOptions,
	StringEnum,
	streamSimple,
	Type,
} from "@earendil-works/pi-ai";
import { getOAuthApiKey } from "@earendil-works/pi-ai/oauth";
import { streamOpenAICodexResponses } from "@earendil-works/pi-ai/openai-codex-responses";
import type {
	AIMemory,
	GroupingSuggestion,
	GroupTitleLength,
	MemoryCandidate,
	MemoryCheck,
	OrganizeRequest,
	OrganizeResponse,
	RefineResponse,
	ServerSettings,
	StoredTabSetSuggestion,
	StoredTabSetSummary,
	TabInfo,
	UserRule,
} from "@tab-orga/shared";
import { contentBridge } from "./content-bridge.js";
import { enforceGroupTitleLength } from "./group-title.js";
import { organizeDebugLog, stamp } from "./organize-debug-log.js";
import { normalizeUrl, type SummaryAvailability, storage } from "./storage.js";

const DEBUG = !!process.env.TAB_ORGA_DEBUG;
const LOG_FILE = "/tmp/tab-orga-pi.log";
const AUTH_PROVIDER = "openai-codex";
const DEFAULT_MODEL = "gpt-5.3-codex";
const ORGANIZE_TIMEOUT_MS = Number(process.env.TAB_ORGA_ORGANIZE_TIMEOUT_MS || 0);
const SUMMARY_TIMEOUT_MS = 60_000;
const TRANSIENT_AGENT_ERROR_RETRY_DELAY_MS = 1_000;

const GROUP_COLORS = [
	"grey",
	"blue",
	"red",
	"yellow",
	"green",
	"pink",
	"purple",
	"cyan",
	"orange",
] as const;
const VALID_COLORS = new Set<string>(GROUP_COLORS);
const COLOR_ALIASES: Record<string, string> = { gray: "grey" };

const AUTH_FILE_CANDIDATES = [
	resolve(process.cwd(), "auth.json"),
	resolve(import.meta.dirname, "../../auth.json"),
	resolve(import.meta.dirname, "../../../../auth.json"),
];

function log(msg: string): void {
	if (DEBUG) {
		const line = stamp(msg);
		console.log(line);
		try {
			appendFileSync(LOG_FILE, `${line}\n`);
		} catch {}
	}
}

function traceLog(runId: string | undefined, message: string, data?: unknown): void {
	if (runId) {
		organizeDebugLog(runId, message, data);
		return;
	}
	log(`[pi] ${message}`);
}

function text(content: string): Array<{ type: "text"; text: string }> {
	return [{ type: "text", text: content }];
}

function toolResult<T>(details: T, content?: string, terminate = false) {
	return {
		content: text(content ?? JSON.stringify(details)),
		details,
		terminate,
	};
}

async function withTimeout<T>(
	promise: Promise<T>,
	label: string,
	timeoutMs: number,
	onTimeout?: () => void,
): Promise<T> {
	if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
		return await promise;
	}
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					onTimeout?.();
					reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}

interface AuthFile {
	path: string;
	auth: Record<string, OAuthCredentials>;
}

function readAuthFile(): AuthFile {
	for (const path of AUTH_FILE_CANDIDATES) {
		if (!existsSync(path)) continue;
		try {
			return {
				path,
				auth: JSON.parse(readFileSync(path, "utf-8")) as Record<string, OAuthCredentials>,
			};
		} catch {
			break;
		}
	}
	return { path: AUTH_FILE_CANDIDATES[0], auth: {} };
}

async function getPiCodexApiKey(provider: string): Promise<string | undefined> {
	if (provider !== AUTH_PROVIDER) return undefined;

	const authFile = readAuthFile();
	if (!authFile.auth[AUTH_PROVIDER]) {
		throw new Error("Pi Codex auth missing. Run `pnpm pi:login`.");
	}

	try {
		const result = await getOAuthApiKey(AUTH_PROVIDER, authFile.auth);
		if (!result) {
			throw new Error("Pi Codex auth missing. Run `pnpm pi:login`.");
		}
		authFile.auth[AUTH_PROVIDER] = { type: "oauth", ...result.newCredentials };
		writeFileSync(authFile.path, JSON.stringify(authFile.auth, null, 2), "utf-8");
		return result.apiKey;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("pnpm pi:login")) {
			throw new Error(message);
		}
		throw new Error(`${message}. Run \`pnpm pi:login\`.`);
	}
}

async function assertPiCodexAuth(): Promise<void> {
	await getPiCodexApiKey(AUTH_PROVIDER);
}

function selectedModel(settings: ServerSettings): Model<Api> {
	const available = getModels(AUTH_PROVIDER);
	const selected = available.find((model) => model.id === settings.model);
	return selected ?? getModel(AUTH_PROVIDER, DEFAULT_MODEL);
}

function createCodexStreamFn(settings: ServerSettings) {
	return (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
		if (model.provider === AUTH_PROVIDER && model.api === "openai-codex-responses") {
			const codexModel = model as Model<"openai-codex-responses">;
			const clamped = options?.reasoning
				? clampThinkingLevel(codexModel, options.reasoning)
				: undefined;
			const reasoningEffort = clamped === "off" ? undefined : clamped;
			const serviceTier = settings.serviceTier === "flex" ? undefined : settings.serviceTier;
			return streamOpenAICodexResponses(codexModel, context, {
				...options,
				reasoningEffort,
				reasoningSummary: "auto",
				serviceTier,
				textVerbosity: "low",
			});
		}
		return streamSimple(model, context, options);
	};
}

function createAgent(
	settings: ServerSettings,
	systemPrompt: string,
	tools: AgentTool[],
	thinking: ThinkingLevel,
) {
	return new Agent({
		initialState: {
			systemPrompt,
			model: selectedModel(settings),
			thinkingLevel: thinking,
			tools,
		},
		getApiKey: getPiCodexApiKey,
		sessionId: `tab-orga-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		streamFn: createCodexStreamFn(settings),
		transport: "sse",
		toolExecution: "sequential",
	});
}

function sanitizeSuggestions(
	raw: unknown,
	tabs: TabInfo[],
	groupTitleLength: GroupTitleLength = "medium",
	validExistingGroupIds?: Set<number>,
): GroupingSuggestion[] {
	if (!Array.isArray(raw)) return [];
	const validTabIds = new Set(tabs.map((tab) => tab.id));

	return raw.map((entry) => {
		const suggestion = entry as Partial<GroupingSuggestion>;
		let color = String(suggestion.color || "grey").toLowerCase();
		if (COLOR_ALIASES[color]) color = COLOR_ALIASES[color];
		if (!VALID_COLORS.has(color)) {
			log(
				`[sanitize] Invalid color "${suggestion.color}" for group "${suggestion.groupName}", defaulting to grey`,
			);
			color = "grey";
		}

		const seen = new Set<number>();
		const tabIds = (Array.isArray(suggestion.tabIds) ? suggestion.tabIds : [])
			.filter((id): id is number => typeof id === "number" && validTabIds.has(id))
			.filter((id) => {
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			});

		const confidence =
			typeof suggestion.confidence === "number" && Number.isFinite(suggestion.confidence)
				? Math.min(1, Math.max(0, suggestion.confidence))
				: 0.5;
		const requestedExistingGroupId =
			typeof suggestion.existingGroupId === "number" ? suggestion.existingGroupId : undefined;
		const existingGroupId =
			requestedExistingGroupId !== undefined &&
			(!validExistingGroupIds || validExistingGroupIds.has(requestedExistingGroupId))
				? requestedExistingGroupId
				: undefined;
		if (requestedExistingGroupId !== undefined && existingGroupId === undefined) {
			log(
				`[sanitize] Dropping invalid existingGroupId ${requestedExistingGroupId} for group "${suggestion.groupName}"`,
			);
		}

		return {
			groupName: enforceGroupTitleLength(
				String(suggestion.groupName || "Untitled"),
				groupTitleLength,
			),
			color: color as GroupingSuggestion["color"],
			tabIds,
			existingGroupId,
			isNew: existingGroupId === undefined,
			confidence,
		};
	});
}

function normalizeMemoryChecks(raw: unknown): MemoryCheck[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((check) => {
			const item = check as Partial<MemoryCheck>;
			if (!item.memoryId) return null;
			const status =
				item.status === "followed" || item.status === "not_applicable" || item.status === "ignored"
					? item.status
					: "ignored";
			return {
				memoryId: String(item.memoryId),
				status,
				reason: String(item.reason || ""),
			};
		})
		.filter((check): check is MemoryCheck => check !== null);
}

function normalizeMemoryCandidates(raw: unknown): MemoryCandidate[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((candidate) => {
			const item = candidate as Partial<MemoryCandidate>;
			const observation = String(item.observation || "").trim();
			if (!observation) return null;
			return {
				observation,
				reason: String(item.reason || "").trim(),
			};
		})
		.filter((candidate): candidate is MemoryCandidate => candidate !== null);
}

function normalizeStoreSuggestions(
	raw: unknown,
	tabs: TabInfo[],
	storedSets: StoredTabSetSummary[],
): StoredTabSetSuggestion[] {
	if (!Array.isArray(raw)) return [];
	const validTabIds = new Set(tabs.map((tab) => tab.id));
	const setsById = new Map(storedSets.map((set) => [set.id, set]));
	return raw
		.map((suggestion) => {
			const item = suggestion as Partial<StoredTabSetSuggestion>;
			const setId = String(item.setId || "");
			const set = setsById.get(setId);
			if (!set) return null;
			const seen = new Set<number>();
			const tabIds = (Array.isArray(item.tabIds) ? item.tabIds : [])
				.filter((id): id is number => typeof id === "number" && validTabIds.has(id))
				.filter((id) => {
					if (seen.has(id)) return false;
					seen.add(id);
					return true;
				});
			if (tabIds.length === 0) return null;
			const confidence =
				item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
					? item.confidence
					: "medium";
			return {
				setId,
				setName: set.name,
				tabIds,
				confidence,
				reason: String(item.reason || "").slice(0, 400),
			};
		})
		.filter((suggestion): suggestion is StoredTabSetSuggestion => suggestion !== null);
}

function memoryValidationIssues(memories: AIMemory[], checks: MemoryCheck[]): string[] {
	if (memories.length === 0) return [];
	const byId = new Map(checks.map((check) => [check.memoryId, check]));
	const issues: string[] = [];

	for (const memory of memories) {
		const check = byId.get(memory.id);
		if (!check) {
			issues.push(`Missing memoryChecks entry for memory ${memory.id}: ${memory.observation}`);
		} else if (check.status === "ignored") {
			issues.push(`Memory ${memory.id} was marked ignored: ${check.reason}`);
		}
	}

	return issues;
}

function buildMemoryDirectivePrompt(memories: AIMemory[]): string {
	if (memories.length === 0) return "";
	return `\n\nSaved memories are hard directives. A one-off instruction can override a memory for that run only; mark the overridden memory not_applicable with the reason. Each final submit tool call must include one memoryChecks item for every memory ID, marking it followed or not_applicable. Do not mark an applicable memory ignored.\n${memories
		.map((memory) => `- [${memory.id}] ${memory.observation}`)
		.join("\n")}`;
}

function buildGroupTitlePrompt(groupTitleLength: GroupTitleLength): string {
	if (groupTitleLength === "short") {
		return 'Chrome group titles must be two uppercase letters, e.g. "BK", "AI", "GH".';
	}
	if (groupTitleLength === "long") {
		return 'Chrome group titles may use multiple compact words, e.g. "Bike Research" or "AI Docs".';
	}
	return 'Chrome group titles must be one concise word, e.g. "Bikes", "Docs", "Shopping".';
}

function buildSystemPrompt(
	kind: string,
	memories: AIMemory[],
	generalPrompt?: string,
	groupTitleLength: GroupTitleLength = "medium",
): string {
	let prompt = `You are a browser tab organization agent for ${kind}. Use only the provided tools. Do not answer directly when a submit_* tool is available. Prefer compact, useful Chrome tab groups. Leave tabs ungrouped when grouping would be forced.`;
	prompt += `\n\n${buildGroupTitlePrompt(groupTitleLength)} The server will enforce this before applying suggestions.`;
	prompt +=
		"\n\nExisting Chrome groups are editable context, not a reason to stop. Consider every current tab, including tabs that are already grouped. Prefer preserving an existing group when it is still coherent, add matching ungrouped tabs to it with existingGroupId, and move already-grouped tabs when a better group exists. Include the full desired tab membership when reusing an existing group. Never return an empty or no-op proposal only because groups already exist.";
	prompt +=
		"\n\nStored research sets are manual archives of tabs. Suggest storing current tabs into an existing set only when the match is clear; never assume tabs will close automatically.";
	if (generalPrompt?.trim()) {
		prompt += `\n\nStanding user instructions:\n${generalPrompt.trim()}`;
	}
	prompt += buildMemoryDirectivePrompt(memories);
	return prompt;
}

function domainFor(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function buildMetadataFallback(tab: TabInfo): string {
	const metadata = [tab.metaDescription, tab.pageText?.slice(0, 400)].filter(Boolean).join(" ");
	const parts = [`Title: ${tab.title}`, `URL: ${tab.url}`];
	if (metadata) parts.push(`Metadata: ${metadata.replace(/\s+/g, " ").trim().slice(0, 900)}`);
	return parts.join(" | ");
}

function compactTab(tab: TabInfo, availability: Record<string, SummaryAvailability>) {
	const summary = availability[tab.url];
	return {
		id: tab.id,
		windowId: tab.windowId,
		title: tab.title,
		url: tab.url,
		domain: domainFor(tab.url),
		groupId: tab.groupId,
		metaDescription: tab.metaDescription,
		summaryStage: summary?.stage || "none",
		summary: summary?.bestSummary,
		metadataFallback: summary?.bestSummary ? undefined : buildMetadataFallback(tab),
	};
}

interface RunContext {
	tabs: TabInfo[];
	existingGroups: OrganizeRequest["existingGroups"];
	rules: UserRule[];
	memories: AIMemory[];
	instruction?: string;
	suggestions?: GroupingSuggestion[];
	feedback?: string;
	targetGroupName?: string;
	targetTabId?: number;
	summaries: Record<string, string>;
	summaryAvailability: Record<string, SummaryAvailability>;
	storedSets: StoredTabSetSummary[];
	contextRead: boolean;
	summariesEnsured: boolean;
	storedSetsRead: boolean;
	storeSuggestionsSubmitted: boolean;
	storeSuggestions: StoredTabSetSuggestion[];
	proposalRead: boolean;
	traceId?: string;
}

function refreshSummaries(ctx: RunContext): void {
	ctx.summaries = storage.getSummariesForUrls(ctx.tabs.map((tab) => tab.url));
	ctx.summaryAvailability = storage.getSummaryAvailability(ctx.tabs.map((tab) => tab.url));
}

function getCurrentTabContextTool(ctx: RunContext): AgentTool {
	return {
		name: "get_current_tab_context",
		label: "Get Current Tab Context",
		description:
			"Read the current browser tab context, including tabs, metadata, cached summaries, groups, rules, saved memories, and one-off instruction.",
		parameters: Type.Object({}),
		executionMode: "sequential",
		execute: async () => {
			const startedAt = Date.now();
			ctx.contextRead = true;
			refreshSummaries(ctx);
			const stageCounts = ctx.tabs.reduce<Record<string, number>>(
				(counts, tab) => {
					const stage = ctx.summaryAvailability[tab.url]?.stage || "none";
					counts[stage] = (counts[stage] || 0) + 1;
					return counts;
				},
				{ none: 0, stage1: 0, stage2: 0 },
			);
			log(
				`[pi] get_current_tab_context tabs=${ctx.tabs.length} groups=${ctx.existingGroups.length} summaries stage2=${stageCounts.stage2 || 0} stage1=${stageCounts.stage1 || 0} none=${stageCounts.none || 0}`,
			);
			traceLog(ctx.traceId, "tool get_current_tab_context", {
				durationMs: Date.now() - startedAt,
				tabs: ctx.tabs.length,
				groups: ctx.existingGroups.length,
				rules: ctx.rules.length,
				memories: ctx.memories.length,
				summaries: stageCounts,
			});
			const details = {
				tabs: ctx.tabs.map((tab) => compactTab(tab, ctx.summaryAvailability)),
				existingGroups: ctx.existingGroups,
				rules: ctx.rules,
				memories: ctx.memories.map((memory) => ({
					id: memory.id,
					observation: memory.observation,
					source: memory.source,
				})),
				oneOffInstruction: ctx.instruction || "",
			};
			return toolResult(details);
		},
	};
}

function ensureTabSummariesTool(ctx: RunContext): AgentTool {
	return {
		name: "ensure_tab_summaries",
		label: "Ensure Tab Summaries",
		description:
			"Ensure current HTTP tabs have cached summaries before grouping. Returns the refreshed cache state and any tabs that still lack summaries.",
		parameters: Type.Object({}),
		executionMode: "sequential",
		execute: async () => {
			const startedAt = Date.now();
			ctx.summariesEnsured = true;
			refreshSummaries(ctx);

			const httpTabs = ctx.tabs.filter((tab) => tab.url.startsWith("http"));
			const missingStage1 = httpTabs.filter(
				(tab) => ctx.summaryAvailability[tab.url]?.stage === "none",
			);
			if (missingStage1.length > 0) {
				queueStage1Summaries(missingStage1, "ensure_tab_summaries");
			}

			const missing = httpTabs
				.filter((tab) => ctx.summaryAvailability[tab.url]?.stage === "none")
				.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url }));
			log(
				`[pi] ensure_tab_summaries available=${httpTabs.length - missing.length}/${httpTabs.length} queuedStage1=${missingStage1.length} missing=${missing.length}`,
			);
			traceLog(ctx.traceId, "tool ensure_tab_summaries", {
				durationMs: Date.now() - startedAt,
				httpTabs: httpTabs.length,
				available: httpTabs.length - missing.length,
				queuedStage1: missingStage1.length,
				missing: missing.length,
			});

			return toolResult({
				available: httpTabs.length - missing.length,
				queuedStage1: missingStage1.length,
				missing,
				summaries: Object.fromEntries(
					httpTabs.map((tab) => {
						const summary = ctx.summaryAvailability[tab.url];
						return [
							tab.id,
							{
								stage: summary?.stage || "none",
								summary: summary?.bestSummary || null,
							},
						];
					}),
				),
			});
		},
	};
}

function getStoredTabSetsTool(ctx: RunContext): AgentTool {
	return {
		name: "get_stored_tab_sets",
		label: "Get Stored Tab Sets",
		description:
			"List stored research sets so current tabs can be compared against restorable tab archives.",
		parameters: Type.Object({}),
		executionMode: "sequential",
		execute: async () => {
			const startedAt = Date.now();
			ctx.storedSetsRead = true;
			ctx.storedSets = storage.listStoredTabSets();
			log(`[pi] get_stored_tab_sets count=${ctx.storedSets.length}`);
			traceLog(ctx.traceId, "tool get_stored_tab_sets", {
				durationMs: Date.now() - startedAt,
				count: ctx.storedSets.length,
			});
			return toolResult({
				sets: ctx.storedSets.map((set) => ({
					id: set.id,
					name: set.name,
					color: set.color,
					summary: set.summary,
					keywords: set.keywords,
					domains: set.domains,
					tabCount: set.tabCount,
					updatedAt: set.updatedAt,
				})),
			});
		},
	};
}

function getStoredTabSetTool(ctx: RunContext): AgentTool {
	return {
		name: "get_stored_tab_set",
		label: "Get Stored Tab Set",
		description:
			"Read one stored research set in detail when the set list suggests a possible match.",
		parameters: Type.Object({
			setId: Type.String({ minLength: 1 }),
			reason: Type.String({ minLength: 1 }),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const startedAt = Date.now();
			const args = params as { setId: string; reason: string };
			if (!ctx.storedSetsRead)
				throw new Error("Call get_stored_tab_sets before get_stored_tab_set.");
			const set = storage.getStoredTabSet(args.setId);
			log(`[pi] get_stored_tab_set id=${args.setId} found=${set ? "yes" : "no"}`);
			traceLog(ctx.traceId, "tool get_stored_tab_set", {
				durationMs: Date.now() - startedAt,
				setId: args.setId,
				found: !!set,
				tabCount: set?.tabs.length || 0,
			});
			if (!set) {
				return toolResult({ setId: args.setId, reason: args.reason, found: false });
			}
			return toolResult({
				setId: set.id,
				name: set.name,
				color: set.color,
				summary: set.summary,
				keywords: set.keywords,
				domains: set.domains,
				reason: args.reason,
				tabs: set.tabs.map((tab) => ({
					title: tab.title,
					url: tab.originalUrl,
					domain: domainFor(tab.originalUrl),
					stage1Summary: tab.stage1Summary,
					stage2Summary: tab.stage2Summary,
				})),
			});
		},
	};
}

const StoreSuggestionSchema = Type.Object({
	setId: Type.String(),
	setName: Type.String(),
	tabIds: Type.Array(Type.Number()),
	confidence: StringEnum(["low", "medium", "high"] as const),
	reason: Type.String(),
});

function submitStoredTabSuggestionsTool(ctx: RunContext): AgentTool {
	return {
		name: "submit_stored_tab_suggestions",
		label: "Submit Stored Tab Suggestions",
		description:
			"Submit manual-only suggestions to store current tabs into existing stored research sets. Submit an empty array when there are no strong matches.",
		parameters: Type.Object({
			suggestions: Type.Array(StoreSuggestionSchema),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const startedAt = Date.now();
			const args = params as { suggestions: unknown[] };
			if (!ctx.storedSetsRead)
				throw new Error("Call get_stored_tab_sets before submit_stored_tab_suggestions.");
			ctx.storeSuggestionsSubmitted = true;
			ctx.storeSuggestions = normalizeStoreSuggestions(args.suggestions, ctx.tabs, ctx.storedSets);
			log(`[pi] submit_stored_tab_suggestions count=${ctx.storeSuggestions.length}`);
			traceLog(ctx.traceId, "tool submit_stored_tab_suggestions", {
				durationMs: Date.now() - startedAt,
				count: ctx.storeSuggestions.length,
			});
			return toolResult({ suggestions: ctx.storeSuggestions });
		},
	};
}

function getCurrentProposalViewTool(ctx: RunContext): AgentTool {
	return {
		name: "get_current_proposal_view",
		label: "Get Current Proposal View",
		description: "Read the exact proposal currently shown to the user before refining it.",
		parameters: Type.Object({}),
		executionMode: "sequential",
		execute: async () => {
			ctx.proposalRead = true;
			const groupedTabIds = new Set(
				(ctx.suggestions || []).flatMap((suggestion) => suggestion.tabIds),
			);
			const details = {
				suggestions: ctx.suggestions || [],
				tabs: ctx.tabs.map((tab) => compactTab(tab, ctx.summaryAvailability)),
				ungroupedTabIds: ctx.tabs.filter((tab) => !groupedTabIds.has(tab.id)).map((tab) => tab.id),
				feedback: ctx.feedback || "",
				targetGroupName: ctx.targetGroupName,
				targetTabId: ctx.targetTabId,
			};
			return toolResult(details);
		},
	};
}

function getPageContentTool(ctx: RunContext): AgentTool {
	return {
		name: "get_page_content",
		label: "Get Page Content",
		description:
			"Fetch targeted full text for ambiguous tabs. Use only for specific tabs whose title, URL, metadata, and summary are insufficient.",
		parameters: Type.Object({
			tabIds: Type.Array(Type.Number(), { minItems: 1 }),
			reason: Type.String({ minLength: 1 }),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const startedAt = Date.now();
			const args = params as { tabIds: number[]; reason: string };
			const tabIds = [...new Set(args.tabIds)].filter((id) =>
				ctx.tabs.some((tab) => tab.id === id),
			);
			log(`[pi] get_page_content: tabs=${tabIds.join(",")} reason="${args.reason}"`);
			traceLog(ctx.traceId, "tool get_page_content requested", {
				tabIds,
				reason: args.reason,
				contentBridgeListeners: contentBridge.hasListeners(),
			});
			const results: Array<{ tabId: number; content: string }> = [];

			if (contentBridge.hasListeners()) {
				const contentMap = await contentBridge.requestContent(tabIds);
				for (const tabId of tabIds) {
					const content = contentMap.get(tabId);
					results.push({
						tabId,
						content: content ? content.slice(0, 12_000) : "(content unavailable)",
					});
				}
			} else {
				for (const tabId of tabIds) {
					const tab = ctx.tabs.find((item) => item.id === tabId);
					results.push({
						tabId,
						content: tab?.pageText?.slice(0, 12_000) || "(content bridge not connected)",
					});
				}
			}

			traceLog(ctx.traceId, "tool get_page_content", {
				durationMs: Date.now() - startedAt,
				tabIds,
				available: results.filter((result) => !result.content.startsWith("(")).length,
			});
			return toolResult({ reason: args.reason, results });
		},
	};
}

const MemoryCheckSchema = Type.Object({
	memoryId: Type.String(),
	status: StringEnum(["followed", "not_applicable", "ignored"] as const),
	reason: Type.String(),
});

const GroupingSuggestionSchema = Type.Object({
	groupName: Type.String({ minLength: 1 }),
	color: StringEnum(GROUP_COLORS),
	tabIds: Type.Array(Type.Number()),
	existingGroupId: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
	isNew: Type.Boolean(),
	confidence: Type.Number(),
});

interface SubmittedGrouping {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	memoryChecks: MemoryCheck[];
	storeSuggestions: StoredTabSetSuggestion[];
}

function submitGroupingResultTool(
	ctx: RunContext,
	onSubmit: (result: SubmittedGrouping) => void,
): AgentTool {
	return {
		name: "submit_grouping_result",
		label: "Submit Grouping Result",
		description:
			"Submit the final tab grouping proposal after reading context and ensuring summaries. This is the only final output for organization.",
		parameters: Type.Object({
			suggestions: Type.Array(GroupingSuggestionSchema),
			reasoning: Type.String(),
			memoryChecks: Type.Array(MemoryCheckSchema),
			storeSuggestions: Type.Optional(Type.Array(StoreSuggestionSchema)),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const startedAt = Date.now();
			const args = params as {
				suggestions: unknown[];
				reasoning: string;
				memoryChecks: unknown[];
				storeSuggestions?: unknown[];
			};
			if (!ctx.contextRead)
				throw new Error("Call get_current_tab_context before submit_grouping_result.");
			if (!ctx.summariesEnsured)
				throw new Error("Call ensure_tab_summaries before submit_grouping_result.");
			if (!ctx.storedSetsRead)
				throw new Error("Call get_stored_tab_sets before submit_grouping_result.");
			if (!ctx.storeSuggestionsSubmitted)
				throw new Error(
					"Call submit_stored_tab_suggestions with an empty list if there are no matches before submit_grouping_result.",
				);
			const result = {
				suggestions: sanitizeSuggestions(
					args.suggestions,
					ctx.tabs,
					storage.getSettings().groupTitleLength,
					new Set(ctx.existingGroups.map((group) => group.id)),
				),
				reasoning: args.reasoning,
				memoryChecks: normalizeMemoryChecks(args.memoryChecks),
				storeSuggestions:
					args.storeSuggestions && args.storeSuggestions.length > 0
						? normalizeStoreSuggestions(args.storeSuggestions, ctx.tabs, ctx.storedSets)
						: ctx.storeSuggestions,
			};
			log(
				`[pi] submit_grouping_result groups=${result.suggestions.length} storeSuggestions=${result.storeSuggestions.length}`,
			);
			traceLog(ctx.traceId, "tool submit_grouping_result", {
				durationMs: Date.now() - startedAt,
				groups: result.suggestions.length,
				groupedTabs: result.suggestions.reduce(
					(sum, suggestion) => sum + suggestion.tabIds.length,
					0,
				),
				storeSuggestions: result.storeSuggestions.length,
			});
			onSubmit(result);
			return toolResult(result, "Grouping result received.", true);
		},
	};
}

interface SubmittedRefine extends SubmittedGrouping {
	memoryCandidates: MemoryCandidate[];
}

function submitRefineResultTool(
	ctx: RunContext,
	onSubmit: (result: SubmittedRefine) => void,
): AgentTool {
	return {
		name: "submit_refine_result",
		label: "Submit Refine Result",
		description:
			"Submit the complete updated proposal after reading the current proposal view. Include reusable preferences as memory candidates only.",
		parameters: Type.Object({
			suggestions: Type.Array(GroupingSuggestionSchema),
			reasoning: Type.String(),
			memoryCandidates: Type.Array(
				Type.Object({
					observation: Type.String(),
					reason: Type.String(),
				}),
			),
			memoryChecks: Type.Array(MemoryCheckSchema),
			storeSuggestions: Type.Optional(Type.Array(StoreSuggestionSchema)),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const args = params as {
				suggestions: unknown[];
				reasoning: string;
				memoryCandidates: unknown[];
				memoryChecks: unknown[];
				storeSuggestions?: unknown[];
			};
			if (!ctx.proposalRead)
				throw new Error("Call get_current_proposal_view before submit_refine_result.");
			const result = {
				suggestions: sanitizeSuggestions(
					args.suggestions,
					ctx.tabs,
					storage.getSettings().groupTitleLength,
					new Set(
						(ctx.suggestions || [])
							.map((suggestion) => suggestion.existingGroupId)
							.filter((id): id is number => typeof id === "number"),
					),
				),
				reasoning: args.reasoning,
				memoryCandidates: normalizeMemoryCandidates(args.memoryCandidates),
				memoryChecks: normalizeMemoryChecks(args.memoryChecks),
				storeSuggestions:
					args.storeSuggestions && args.storeSuggestions.length > 0
						? normalizeStoreSuggestions(args.storeSuggestions, ctx.tabs, ctx.storedSets)
						: ctx.storeSuggestions,
			};
			onSubmit(result);
			return toolResult(result, "Refine result received.", true);
		},
	};
}

interface SubmittedMemoryEdit {
	memories: Array<{ id: string; observation: string }>;
	summary: string;
}

function submitMemoryEditTool(onSubmit: (result: SubmittedMemoryEdit) => void): AgentTool {
	return {
		name: "submit_memory_edit",
		label: "Submit Memory Edit",
		description:
			"Submit the full final list of saved memories after applying the user's memory-edit instruction.",
		parameters: Type.Object({
			memories: Type.Array(
				Type.Object({
					id: Type.String(),
					observation: Type.String(),
				}),
			),
			summary: Type.String(),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const args = params as SubmittedMemoryEdit;
			const result = {
				memories: args.memories.map((memory) => ({
					id: memory.id,
					observation: memory.observation.trim(),
				})),
				summary: args.summary,
			};
			onSubmit(result);
			return toolResult(result, "Memory edit received.", true);
		},
	};
}

interface MetadataSummaryInput {
	tabId: number;
	title: string;
	url: string;
	metaDescription?: string;
	ogDescription?: string;
	keywords?: string;
}

interface SubmittedMetadataSummaries {
	summaries: Array<{ tabId: number; summary: string }>;
}

function submitMetadataSummariesTool(
	onSubmit: (result: SubmittedMetadataSummaries) => void,
): AgentTool {
	return {
		name: "submit_metadata_summaries",
		label: "Submit Metadata Summaries",
		description: "Submit Stage 1 summaries for browser tabs using title, URL, and metadata only.",
		parameters: Type.Object({
			summaries: Type.Array(
				Type.Object({
					tabId: Type.Number(),
					summary: Type.String(),
				}),
			),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const args = params as SubmittedMetadataSummaries;
			const result = {
				summaries: args.summaries.map((summary) => ({
					tabId: summary.tabId,
					summary: summary.summary.trim(),
				})),
			};
			onSubmit(result);
			return toolResult(result, "Metadata summaries received.", true);
		},
	};
}

interface SubmittedScreenshotSummaries {
	summaries: Array<{ tabId: number; summary: string }>;
}

function submitScreenshotSummariesTool(
	onSubmit: (result: SubmittedScreenshotSummaries) => void,
): AgentTool {
	return {
		name: "submit_screenshot_summaries",
		label: "Submit Screenshot Summaries",
		description: "Submit text summaries for the provided tab screenshots.",
		parameters: Type.Object({
			summaries: Type.Array(
				Type.Object({
					tabId: Type.Number(),
					summary: Type.String(),
				}),
			),
		}),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			const args = params as SubmittedScreenshotSummaries;
			const result = {
				summaries: args.summaries.map((summary) => ({
					tabId: summary.tabId,
					summary: summary.summary.trim(),
				})),
			};
			onSubmit(result);
			return toolResult(result, "Screenshot summaries received.", true);
		},
	};
}

function extractAssistantError(agent: Agent): string | null {
	return agent.state.errorMessage || null;
}

function formatAgentError(message: string): string {
	if (/No API key|auth missing|not logged in/i.test(message)) {
		return "Pi Codex auth missing. Run `pnpm pi:login`.";
	}
	return message;
}

function isTransientAgentError(message: string): boolean {
	return /WebSocket error|socket hang up|ECONNRESET|ETIMEDOUT|network/i.test(message);
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function promptUntilSubmitted<T>({
	agent,
	initialPrompt,
	getSubmitted,
	resetSubmitted,
	validate,
	timeoutMs = ORGANIZE_TIMEOUT_MS,
	stage = "Pi agent prompt",
	traceId,
}: {
	agent: Agent;
	initialPrompt: string | { text: string; images: ImageContent[] };
	getSubmitted: () => T | null;
	resetSubmitted: () => void;
	validate?: (result: T) => string[];
	timeoutMs?: number;
	stage?: string;
	traceId?: string;
}): Promise<T> {
	let prompt = initialPrompt;
	for (let attempt = 0; attempt < 2; attempt++) {
		log(`[pi] ${stage}: prompt attempt ${attempt + 1}`);
		const promptStartedAt = Date.now();
		traceLog(traceId, "agent prompt start", {
			stage,
			attempt: attempt + 1,
			timeoutMs,
			promptChars: typeof prompt === "string" ? prompt.length : prompt.text.length,
			imageCount: typeof prompt === "string" ? 0 : prompt.images.length,
		});
		try {
			if (typeof prompt === "string") {
				await withTimeout(agent.prompt(prompt), `${stage}: prompt ${attempt + 1}`, timeoutMs, () =>
					agent.abort(),
				);
			} else {
				await withTimeout(
					agent.prompt(prompt.text, prompt.images),
					`${stage}: prompt ${attempt + 1}`,
					timeoutMs,
					() => agent.abort(),
				);
			}
			traceLog(traceId, "agent prompt returned", {
				stage,
				attempt: attempt + 1,
				durationMs: Date.now() - promptStartedAt,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			traceLog(traceId, "agent prompt failed", {
				stage,
				attempt: attempt + 1,
				durationMs: Date.now() - promptStartedAt,
				error: message,
			});
			if (attempt === 0 && isTransientAgentError(message)) {
				traceLog(traceId, "agent transient prompt error; retrying prompt", {
					stage,
					error: message,
				});
				resetSubmitted();
				agent.reset();
				prompt = initialPrompt;
				await delay(TRANSIENT_AGENT_ERROR_RETRY_DELAY_MS);
				continue;
			}
			throw error;
		}

		const submitted = getSubmitted();
		const error = extractAssistantError(agent);
		if (error) {
			if (submitted) {
				traceLog(traceId, "agent state error after submit ignored", { stage, error });
			} else if (attempt === 0 && isTransientAgentError(error)) {
				traceLog(traceId, "agent transient state error; retrying prompt", { stage, error });
				resetSubmitted();
				agent.reset();
				prompt = initialPrompt;
				await delay(TRANSIENT_AGENT_ERROR_RETRY_DELAY_MS);
				continue;
			} else {
				traceLog(traceId, "agent state error", { stage, error });
				throw new Error(formatAgentError(error));
			}
		}

		if (!submitted) {
			log(`[pi] ${stage}: submit tool was not called on attempt ${attempt + 1}`);
			traceLog(traceId, "submit tool missing", { stage, attempt: attempt + 1 });
			if (attempt === 0) {
				prompt =
					"You did not call the required submit tool. Call the correct submit tool now with the complete result.";
				continue;
			}
			throw new Error("Pi agent did not submit a result.");
		}

		const issues = validate?.(submitted) || [];
		if (issues.length === 0) {
			traceLog(traceId, "submitted result accepted", { stage, attempt: attempt + 1 });
			return submitted;
		}
		log(`[pi] ${stage}: validation issues ${issues.join("; ")}`);
		traceLog(traceId, "submitted result validation failed", { stage, issues });

		if (attempt === 0) {
			resetSubmitted();
			prompt = `The submitted result failed validation:\n${issues.join("\n")}\nSubmit a corrected complete result.`;
			continue;
		}
		throw new Error(`Pi agent result failed validation: ${issues.join("; ")}`);
	}

	throw new Error("Pi agent did not submit a result.");
}

function makeRunContext(
	request: OrganizeRequest,
	suggestions?: GroupingSuggestion[],
	traceId?: string,
): RunContext {
	const tabs = request.tabs;
	const rules = storage.getRules();
	const memories = storage.getMemories();
	const urls = tabs.map((tab) => tab.url);
	return {
		tabs,
		existingGroups: request.existingGroups,
		rules,
		memories,
		instruction: request.instruction,
		suggestions,
		summaries: storage.getSummariesForUrls(urls),
		summaryAvailability: storage.getSummaryAvailability(urls),
		storedSets: [],
		contextRead: false,
		summariesEnsured: false,
		storedSetsRead: false,
		storeSuggestionsSubmitted: false,
		storeSuggestions: [],
		proposalRead: false,
		traceId,
	};
}

export async function organizeWithAI(
	request: OrganizeRequest,
	traceId?: string,
): Promise<OrganizeResponse> {
	const overallStartedAt = Date.now();
	await assertPiCodexAuth();
	const settings = storage.getSettings();
	const ctx = makeRunContext(request, undefined, traceId);
	const groupedTabCount = request.tabs.filter((tab) => tab.groupId !== -1).length;
	log(
		`[pi] organize start tabs=${request.tabs.length} groupedTabs=${groupedTabCount} existingGroups=${request.existingGroups.length}`,
	);
	const summaryCounts = storage.getSummaryAvailability(request.tabs.map((tab) => tab.url));
	const stageCounts = Object.values(summaryCounts).reduce<Record<string, number>>(
		(counts, summary) => {
			counts[summary.stage] = (counts[summary.stage] || 0) + 1;
			return counts;
		},
		{ none: 0, stage1: 0, stage2: 0 },
	);
	traceLog(traceId, "organizeWithAI start", {
		tabs: request.tabs.length,
		groups: request.existingGroups.length,
		groupedTabs: groupedTabCount,
		instruction: request.instruction || "",
		summaryStages: stageCounts,
		model: settings.model,
		organizationThinking: settings.organizationThinking,
		serviceTier: settings.serviceTier,
		groupTitleLength: settings.groupTitleLength,
	});
	let submitted: SubmittedGrouping | null = null;
	const tools = [
		getCurrentTabContextTool(ctx),
		ensureTabSummariesTool(ctx),
		getStoredTabSetsTool(ctx),
		getStoredTabSetTool(ctx),
		submitStoredTabSuggestionsTool(ctx),
		getPageContentTool(ctx),
		submitGroupingResultTool(ctx, (result) => {
			submitted = result;
		}),
	];

	const agent = createAgent(
		settings,
		buildSystemPrompt(
			"organizing tabs",
			ctx.memories,
			settings.generalPrompt,
			settings.groupTitleLength,
		),
		tools,
		settings.organizationThinking,
	);

	const prompt = `Organize the current browser window, including tabs that are already in Chrome groups and tabs that are currently ungrouped. Existing groups should be treated as reusable/editable context with a slight preference to keep coherent groups, not as locked state. Add matching tabs to existing groups with existingGroupId, move grouped tabs when the fit is better elsewhere, and create new groups when needed. Required sequence: call get_current_tab_context, call ensure_tab_summaries, call get_stored_tab_sets, optionally call get_stored_tab_set for likely archive matches, optionally call get_page_content for ambiguous tabs, call submit_stored_tab_suggestions with [] when there are no strong matches, then call submit_grouping_result. One-off instruction for this run: ${request.instruction?.trim() || "(none)"}.`;
	traceLog(traceId, "organize prompt prepared", {
		promptChars: prompt.length,
		toolCount: tools.length,
	});

	const result = await promptUntilSubmitted({
		agent,
		initialPrompt: prompt,
		getSubmitted: () => submitted,
		resetSubmitted: () => {
			submitted = null;
		},
		validate: (value) => memoryValidationIssues(ctx.memories, value.memoryChecks),
		timeoutMs: ORGANIZE_TIMEOUT_MS,
		stage: "organize",
		traceId,
	});
	log(
		`[pi] organize done groups=${result.suggestions.length} storeSuggestions=${result.storeSuggestions.length}`,
	);
	traceLog(traceId, "organizeWithAI done", {
		durationMs: Date.now() - overallStartedAt,
		groups: result.suggestions.length,
		storeSuggestions: result.storeSuggestions.length,
	});

	return {
		suggestions: result.suggestions,
		reasoning: result.reasoning,
		storeSuggestions: result.storeSuggestions,
	};
}

export async function analyzeCorrections(
	_originalSuggestions: GroupingSuggestion[],
	_appliedSuggestions: GroupingSuggestion[],
	_tabs: TabInfo[],
): Promise<string[]> {
	// Memory capture is now explicit through memory candidates and POST /api/memory.
	return [];
}

export async function refineWithAI(
	suggestions: GroupingSuggestion[],
	tabs: TabInfo[],
	feedback: string,
	targetGroupName?: string,
	targetTabId?: number,
): Promise<RefineResponse> {
	await assertPiCodexAuth();
	const settings = storage.getSettings();
	const request: OrganizeRequest = { tabs, existingGroups: [], instruction: feedback };
	const ctx = makeRunContext(request, suggestions);
	ctx.feedback = feedback;
	ctx.targetGroupName = targetGroupName;
	ctx.targetTabId = targetTabId;
	let submitted: SubmittedRefine | null = null;

	const tools = [
		getCurrentTabContextTool(ctx),
		getCurrentProposalViewTool(ctx),
		getStoredTabSetsTool(ctx),
		getStoredTabSetTool(ctx),
		submitStoredTabSuggestionsTool(ctx),
		getPageContentTool(ctx),
		submitRefineResultTool(ctx, (result) => {
			submitted = result;
		}),
	];

	const agent = createAgent(
		settings,
		buildSystemPrompt(
			"refining a tab grouping proposal",
			ctx.memories,
			settings.generalPrompt,
			settings.groupTitleLength,
		),
		tools,
		settings.organizationThinking,
	);

	const prompt = `Update the current proposal from user feedback. Required sequence: call get_current_proposal_view before submit_refine_result. If the feedback implies stored research set matches, call get_stored_tab_sets and submit_stored_tab_suggestions first. Feedback: "${feedback}".`;

	const result = await promptUntilSubmitted({
		agent,
		initialPrompt: prompt,
		getSubmitted: () => submitted,
		resetSubmitted: () => {
			submitted = null;
		},
		validate: (value) => memoryValidationIssues(ctx.memories, value.memoryChecks),
		timeoutMs: ORGANIZE_TIMEOUT_MS,
		stage: "refine",
	});
	return {
		...result,
		memories: result.memoryCandidates.map((candidate) => candidate.observation),
	};
}

export async function aiEditMemories(
	instruction: string,
): Promise<{ memories: Array<{ id: string; observation: string }>; summary: string }> {
	await assertPiCodexAuth();
	const settings = storage.getSettings();
	const memories = storage.getMemories();
	const ctx: RunContext = {
		tabs: [],
		existingGroups: [],
		rules: [],
		memories,
		instruction,
		summaries: {},
		summaryAvailability: {},
		storedSets: [],
		contextRead: false,
		summariesEnsured: false,
		storedSetsRead: false,
		storeSuggestionsSubmitted: false,
		storeSuggestions: [],
		proposalRead: false,
	};
	let submitted: SubmittedMemoryEdit | null = null;
	const tools = [
		getCurrentTabContextTool(ctx),
		submitMemoryEditTool((result) => {
			submitted = result;
		}),
	];

	const agent = createAgent(
		settings,
		buildSystemPrompt(
			"editing saved tab organization memories",
			memories,
			settings.generalPrompt,
			settings.groupTitleLength,
		),
		tools,
		settings.organizationThinking,
	);

	const prompt = `Edit the saved memories according to this instruction: "${instruction}". Call get_current_tab_context first, then submit_memory_edit with the full final memory list. Preserve IDs for memories that remain.`;

	return await promptUntilSubmitted({
		agent,
		initialPrompt: prompt,
		getSubmitted: () => submitted,
		resetSubmitted: () => {
			submitted = null;
		},
		timeoutMs: ORGANIZE_TIMEOUT_MS,
		stage: "memory edit",
	});
}

const queuedStage1Urls = new Set<string>();

export function queueStage1Summaries(tabs: TabInfo[], source = "background"): void {
	const candidates = tabs.filter((tab) => tab.url.startsWith("http"));
	if (candidates.length === 0) return;
	const availability = storage.getSummaryAvailability(candidates.map((tab) => tab.url));
	const queued = candidates.filter((tab) => {
		const normalized = normalizeUrl(tab.url);
		const state = availability[tab.url];
		if (state?.stage !== "none" || state.stage1RetryAfter) return false;
		if (queuedStage1Urls.has(normalized)) return false;
		queuedStage1Urls.add(normalized);
		return true;
	});
	if (queued.length === 0) return;

	void (async () => {
		try {
			log(`[stage1] Queued ${queued.length} tabs from ${source}`);
			const summaries = await summarizeMetadataTabs(
				queued.map((tab) => ({
					tabId: tab.id,
					title: tab.title,
					url: tab.url,
					metaDescription: tab.metaDescription,
				})),
			);
			const byId = new Map(summaries.map((summary) => [summary.tabId, summary.summary]));
			const successful = queued
				.map((tab) => ({ url: tab.url, summary: byId.get(tab.id) || "" }))
				.filter((entry) => entry.summary);
			storage.cacheStage1Summaries(successful);
			storage.markStage1Failures(
				queued
					.filter((tab) => !byId.get(tab.id))
					.map((tab) => ({ url: tab.url, reason: "Queued Stage 1 returned no summary" })),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log(`[stage1] Queue failed: ${message}`);
			storage.markStage1Failures(
				queued.map((tab) => ({ url: tab.url, reason: `Queued Stage 1 failed: ${message}` })),
			);
		} finally {
			for (const tab of queued) {
				queuedStage1Urls.delete(normalizeUrl(tab.url));
			}
		}
	})();
}

function imageContentFromScreenshot(image: string): ImageContent {
	const match = image.match(/^data:([^;]+);base64,(.*)$/);
	return {
		type: "image",
		mimeType: match?.[1] || "image/jpeg",
		data: match?.[2] || image,
	};
}

export async function summarizeMetadataTabs(
	tabs: MetadataSummaryInput[],
): Promise<Array<{ tabId: number; summary: string }>> {
	await assertPiCodexAuth();
	const settings = storage.getSettings();
	const batchSize = 10;
	const allSummaries: Array<{ tabId: number; summary: string }> = [];

	for (let i = 0; i < tabs.length; i += batchSize) {
		const batch = tabs.slice(i, i + batchSize);
		let submitted: SubmittedMetadataSummaries | null = null;
		const agent = createAgent(
			settings,
			"Create Stage 1 browser tab summaries from title, URL, and metadata only. Do not infer details that are not supported by the metadata. Use submit_metadata_summaries as the final output.",
			[
				submitMetadataSummariesTool((result) => {
					submitted = result;
				}),
			],
			settings.summaryThinking,
		);

		const prompt = `Create one concise 1-2 sentence summary for each browser tab. Use only the title, URL, domain, and metadata shown here. Include page purpose, product/project names, and useful keywords when supported.\n\nTabs:\n${batch
			.map((tab, index) => {
				const metadata = [
					tab.metaDescription ? `meta description: ${tab.metaDescription}` : "",
					tab.ogDescription ? `og description: ${tab.ogDescription}` : "",
					tab.keywords ? `keywords: ${tab.keywords}` : "",
				]
					.filter(Boolean)
					.join("; ");
				return `${index + 1}. Tab ${tab.tabId}: "${tab.title}" (${tab.url})${
					metadata ? `\n   Metadata: ${metadata}` : ""
				}`;
			})
			.join("\n")}`;

		try {
			const result = await promptUntilSubmitted({
				agent,
				initialPrompt: prompt,
				getSubmitted: () => submitted,
				resetSubmitted: () => {
					submitted = null;
				},
				timeoutMs: SUMMARY_TIMEOUT_MS,
				stage: "stage1 summary batch",
			});
			allSummaries.push(...result.summaries);
		} catch (error) {
			log(`[stage1] Batch failed: ${error instanceof Error ? error.message : String(error)}`);
			for (const tab of batch) {
				allSummaries.push({ tabId: tab.tabId, summary: "" });
			}
		}
	}

	return allSummaries;
}

export async function summarizeScreenshots(
	screenshots: Array<{
		tabId: number;
		image: string;
		title: string;
		url: string;
		metaDescription?: string;
		ogDescription?: string;
		keywords?: string;
	}>,
): Promise<Array<{ tabId: number; summary: string }>> {
	await assertPiCodexAuth();
	const settings = storage.getSettings();
	const batchSize = 4;
	const allSummaries: Array<{ tabId: number; summary: string }> = [];

	for (let i = 0; i < screenshots.length; i += batchSize) {
		const batch = screenshots.slice(i, i + batchSize);
		let submitted: SubmittedScreenshotSummaries | null = null;
		const agent = createAgent(
			settings,
			"Summarize browser tab screenshots for later tab organization and search. Use the submit_screenshot_summaries tool as the final output.",
			[
				submitScreenshotSummariesTool((result) => {
					submitted = result;
				}),
			],
			settings.summaryThinking,
		);

		const prompt = `Create a concise but specific 2-4 sentence summary for each screenshot. Use the title, URL, metadata, and screenshot together. Include visible names, tasks, products, numbers, and page purpose when useful.\n\nTabs:\n${batch
			.map((shot, index) => {
				const metadata = [
					shot.metaDescription ? `meta description: ${shot.metaDescription}` : "",
					shot.ogDescription ? `og description: ${shot.ogDescription}` : "",
					shot.keywords ? `keywords: ${shot.keywords}` : "",
				]
					.filter(Boolean)
					.join("; ");
				return `${index + 1}. Tab ${shot.tabId}: "${shot.title}" (${shot.url})${
					metadata ? `\n   Metadata: ${metadata}` : ""
				}`;
			})
			.join("\n")}\n\nThe screenshots are attached in the same order.`;

		try {
			const result = await promptUntilSubmitted({
				agent,
				initialPrompt: {
					text: prompt,
					images: batch.map((shot) => imageContentFromScreenshot(shot.image)),
				},
				getSubmitted: () => submitted,
				resetSubmitted: () => {
					submitted = null;
				},
				timeoutMs: SUMMARY_TIMEOUT_MS,
				stage: "stage2 screenshot summary batch",
			});
			allSummaries.push(...result.summaries);
		} catch (error) {
			log(`[summarize] Batch failed: ${error instanceof Error ? error.message : String(error)}`);
			for (const shot of batch) {
				allSummaries.push({ tabId: shot.tabId, summary: "" });
			}
		}
	}

	return allSummaries;
}

export async function getAvailableModels(): Promise<Array<{ id: string; name: string }>> {
	return getModels(AUTH_PROVIDER).map((model) => ({ id: model.id, name: model.name }));
}

export async function checkCodexHealth(): Promise<boolean> {
	try {
		await assertPiCodexAuth();
		selectedModel(storage.getSettings());
		return true;
	} catch {
		return false;
	}
}
