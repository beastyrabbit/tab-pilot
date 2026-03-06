import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import type {
	GroupingSuggestion,
	OrganizeRequest,
	OrganizeResponse,
	TabInfo,
} from "@tab-orga/shared";
import { buildGroupingPrompt, buildSystemPrompt } from "../prompts/grouping.js";
import { contentBridge } from "./content-bridge.js";
import { storage } from "./storage.js";

const DEBUG = !!process.env.TAB_ORGA_DEBUG;
const LOG_FILE = "/tmp/tab-orga-codex.log";

function log(msg: string): void {
	console.log(msg);
	if (DEBUG) {
		const line = `${new Date().toISOString()} ${msg}`;
		try {
			appendFileSync(LOG_FILE, `${line}\n`);
		} catch {}
	}
}

const VALID_COLORS = new Set([
	"grey",
	"blue",
	"red",
	"yellow",
	"green",
	"pink",
	"purple",
	"cyan",
	"orange",
]);
const COLOR_ALIASES: Record<string, string> = { gray: "grey" };

/** Ensure every suggestion has a valid Chrome tab group color. */
function sanitizeSuggestions(raw: unknown[]): GroupingSuggestion[] {
	return (raw as GroupingSuggestion[]).map((s) => {
		let color = (s.color || "grey").toLowerCase();
		if (COLOR_ALIASES[color]) color = COLOR_ALIASES[color];
		if (!VALID_COLORS.has(color)) {
			log(`[sanitize] Invalid color "${s.color}" for group "${s.groupName}", defaulting to grey`);
			color = "grey";
		}
		return { ...s, color: color as GroupingSuggestion["color"] };
	});
}

const GROUPING_SCHEMA = {
	type: "object",
	properties: {
		suggestions: {
			type: "array",
			items: {
				type: "object",
				properties: {
					groupName: { type: "string" },
					color: {
						type: "string",
						enum: ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"],
					},
					tabIds: { type: "array", items: { type: "number" } },
					existingGroupId: { type: ["number", "null"] },
					isNew: { type: "boolean" },
					confidence: { type: "number" },
				},
				required: ["groupName", "color", "tabIds", "existingGroupId", "isNew", "confidence"],
				additionalProperties: false,
			},
		},
		reasoning: { type: "string" },
	},
	required: ["suggestions", "reasoning"],
	additionalProperties: false,
};

const CORRECTIONS_SCHEMA = {
	type: "object",
	properties: {
		observations: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: ["observations"],
	additionalProperties: false,
};

let nextId = 1;

interface JsonRpcResponse {
	id: number;
	result?: Record<string, unknown>;
	error?: { code: number; message: string };
}

class CodexAppServer {
	private proc: ChildProcess | null = null;
	private pending = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void }
	>();
	private threadId: string | null = null;
	private initialized = false;
	private turnOutput: string | null = null;
	private turnResolve: ((v: string) => void) | null = null;
	private turnReject: ((e: Error) => void) | null = null;
	// Queue to serialize turns — Codex only handles one turn at a time per thread
	private turnQueue: Array<() => void> = [];
	private turnRunning = false;

	async ensureRunning(): Promise<void> {
		if (this.proc && !this.proc.killed && this.initialized) return;
		log("[codex] Starting app-server...");
		await this.start();
	}

	private async start(): Promise<void> {
		this.proc = spawn("codex", ["app-server"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});

		const rl = createInterface({ input: this.proc.stdout! });
		rl.on("line", (line) => this.handleMessage(line));

		this.proc.stderr?.on("data", (data) => {
			log(`[codex stderr] ${data.toString().trim()}`);
		});

		this.proc.on("exit", (code) => {
			log(`[codex] App-server exited with code ${code}`);
			this.initialized = false;
			this.threadId = null;
			this.proc = null;
			for (const { reject } of this.pending.values()) {
				reject(new Error("Codex app-server exited"));
			}
			this.pending.clear();
		});

		// Initialize
		await this.send("initialize", {
			clientInfo: {
				name: "tab_organizer",
				title: "Tab Organizer",
				version: "0.1.0",
			},
			capabilities: {},
		});

		// Send initialized notification
		this.sendNotification("initialized", {});
		this.initialized = true;
		log("[codex] App-server initialized");
	}

	private handleMessage(line: string): void {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}

		// Response to our request (has id but no method)
		if ("id" in msg && typeof msg.id === "number" && !("method" in msg)) {
			const pending = this.pending.get(msg.id);
			if (pending) {
				this.pending.delete(msg.id);
				const rpc = msg as unknown as JsonRpcResponse;
				if (rpc.error) {
					pending.reject(new Error(rpc.error.message));
				} else {
					pending.resolve(rpc.result);
				}
			}
			return;
		}

		// Request FROM server TO us (has both id and method) — tool execution
		if ("id" in msg && "method" in msg) {
			const reqId = msg.id as number;
			const method = msg.method as string;
			const params = msg.params as Record<string, unknown> | undefined;
			log(`[codex] Incoming request: ${method} (id=${reqId})`);
			this.handleServerRequest(reqId, method, params);
			return;
		}

		// Notification from server (no id, has method)
		const method = msg.method as string;
		const params = msg.params as Record<string, unknown> | undefined;

		// Log exec commands and plan updates with full detail
		if (method === "codex/event/exec_command_begin" || method === "codex/event/exec_command_end") {
			log(`[codex] ${method}: ${JSON.stringify(params).slice(0, 500)}`);
		} else if (method === "codex/event/plan_update") {
			log(`[codex] Plan: ${JSON.stringify(params).slice(0, 500)}`);
		} else if (
			method === "codex/event/mcp_startup_update" ||
			method === "codex/event/mcp_startup_complete"
		) {
			log(`[codex] MCP: ${JSON.stringify(params).slice(0, 300)}`);
		} else if (method !== "item/completed" && method !== "turn/completed") {
			// Skip noisy delta notifications
			if (
				!method.includes("delta") &&
				!method.includes("token") &&
				!method.includes("rateLimits")
			) {
				log(`[codex] Notification: ${method}`);
			}
		}

		// Capture agent message output from item/completed notifications
		if (method === "item/completed" && params) {
			const item = params.item as Record<string, unknown> | undefined;
			if (item?.type === "agentMessage" && typeof item.text === "string") {
				this.turnOutput = item.text;
				log(`[codex] Agent output: ${item.text.slice(0, 1000)}`);
			}
			// Log all completed items with type info
			if (item) {
				const type = item.type as string;
				if (type === "function_call" || type === "toolCall" || type === "mcp_tool_call") {
					log(`[codex] Tool call: ${JSON.stringify(item).slice(0, 500)}`);
				} else if (type === "exec_command") {
					log(`[codex] Exec result: ${JSON.stringify(item).slice(0, 500)}`);
				} else if (type !== "agentMessage" && type !== "userMessage") {
					log(`[codex] Item completed (${type}): ${JSON.stringify(item).slice(0, 300)}`);
				}
			}
		}

		if (method === "turn/completed" && params) {
			const turn = params.turn as Record<string, unknown> | undefined;

			// Check for turn-level error
			if (turn?.status === "failed" && turn.error) {
				const err = turn.error as Record<string, unknown>;
				const errMsg = (err.message as string) || "Turn failed";
				log(`[codex] Turn failed: ${errMsg}`);
				if (this.turnReject) {
					this.turnReject(new Error(errMsg));
					this.turnResolve = null;
					this.turnReject = null;
					this.turnOutput = null;
				}
				return;
			}

			if (this.turnResolve) {
				this.turnResolve(this.turnOutput || "");
				this.turnResolve = null;
				this.turnOutput = null;
			}
		}
	}

	private handleServerRequest(
		reqId: number,
		method: string,
		params: Record<string, unknown> | undefined,
	): void {
		// Handle tool execution requests from Codex
		if (method === "tool/execute" || method === "tools/call") {
			const toolName = (params?.name as string) || (params?.toolName as string) || "";
			const args = (params?.arguments as Record<string, unknown>) || {};
			log(`[codex] Tool execution request: ${toolName} ${JSON.stringify(args).slice(0, 200)}`);

			if (toolName === "get_page_content") {
				this.handleGetPageContent(reqId, args);
				return;
			}

			// Unknown tool - return error
			this.sendResponse(reqId, null, { code: -32601, message: `Unknown tool: ${toolName}` });
			return;
		}

		// Unknown method - log and respond with error
		log(`[codex] Unknown server request: ${method}`);
		this.sendResponse(reqId, null, { code: -32601, message: `Method not found: ${method}` });
	}

	private async handleGetPageContent(reqId: number, args: Record<string, unknown>): Promise<void> {
		const tabIds = (args.tabIds as number[]) || [];
		const reason = (args.reason as string) || "No reason given";
		log(`[codex] get_page_content: tabs=${tabIds.join(",")} reason="${reason}"`);

		if (!contentBridge.hasListeners()) {
			log("[codex] No content bridge listeners — extension not connected");
			this.sendResponse(reqId, {
				content: [
					{
						type: "text",
						text: "Content bridge not connected. The browser extension is not listening. Proceed with available information.",
					},
				],
			});
			return;
		}

		try {
			const contentMap = await contentBridge.requestContent(tabIds);
			const results: string[] = [];
			for (const tabId of tabIds) {
				const content = contentMap.get(tabId);
				if (content) {
					results.push(`[Tab ${tabId}]: ${content.slice(0, 2000)}`);
				} else {
					results.push(`[Tab ${tabId}]: (content unavailable)`);
				}
			}
			this.sendResponse(reqId, {
				content: [{ type: "text", text: results.join("\n\n") }],
			});
		} catch (e) {
			log(`[codex] get_page_content error: ${e}`);
			this.sendResponse(reqId, {
				content: [{ type: "text", text: "Failed to extract page content." }],
			});
		}
	}

	private sendResponse(
		reqId: number,
		result: unknown,
		error?: { code: number; message: string },
	): void {
		const msg: Record<string, unknown> = { jsonrpc: "2.0", id: reqId };
		if (error) {
			msg.error = error;
		} else {
			msg.result = result;
		}
		this.proc!.stdin!.write(`${JSON.stringify(msg)}\n`);
	}

	private send(method: string, params: Record<string, unknown>): Promise<unknown> {
		const id = nextId++;
		const msg = JSON.stringify({ jsonrpc: "2.0", method, id, params });
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.proc!.stdin!.write(`${msg}\n`);
		});
	}

	private sendNotification(method: string, params: Record<string, unknown>): void {
		const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
		this.proc!.stdin!.write(`${msg}\n`);
	}

	async startThread(): Promise<string> {
		const settings = storage.getSettings();
		log(`[codex] Starting thread with model=${settings.model}`);
		const result = (await this.send("thread/start", {
			model: settings.model,
			approvalPolicy: "never",
			sandboxPolicy: "readOnly",
		})) as { thread: { id: string } };
		this.threadId = result.thread.id;
		log(`[codex] Thread started: ${this.threadId}`);
		return this.threadId;
	}

	async runTurn(
		prompt: string,
		outputSchema: Record<string, unknown>,
		images?: Array<{ base64: string; mimeType?: string }>,
	): Promise<string> {
		// Serialize turns — Codex handles one at a time
		if (this.turnRunning) {
			await new Promise<void>((resolve) => {
				this.turnQueue.push(resolve);
			});
		}
		this.turnRunning = true;

		try {
			return await this._executeTurn(prompt, outputSchema, images);
		} finally {
			this.turnRunning = false;
			const next = this.turnQueue.shift();
			if (next) next();
		}
	}

	private async _executeTurn(
		prompt: string,
		outputSchema: Record<string, unknown>,
		images?: Array<{ base64: string; mimeType?: string }>,
	): Promise<string> {
		await this.ensureRunning();

		if (!this.threadId) {
			await this.startThread();
		}

		const inputParts: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];

		// Add images using Codex app-server format (type: "image")
		if (images) {
			for (const img of images) {
				const mime = img.mimeType || "image/jpeg";
				inputParts.push({
					type: "image",
					url: `data:${mime};base64,${img.base64}`,
				});
			}
		}

		log(
			`[codex] Starting turn (prompt length: ${prompt.length} chars, images: ${images?.length || 0})`,
		);
		const startTime = Date.now();

		const outputPromise = new Promise<string>((resolve, reject) => {
			this.turnResolve = resolve;
			this.turnReject = reject;
		});

		await this.send("turn/start", {
			threadId: this.threadId,
			input: inputParts,
			outputSchema,
		});

		const result = await outputPromise;
		log(
			`[codex] Turn completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s (output: ${result.length} chars)`,
		);
		return result;
	}

	async listModels(): Promise<Array<{ id: string; name: string }>> {
		await this.ensureRunning();
		const result = (await this.send("model/list", {
			limit: 50,
			includeHidden: false,
		})) as Record<string, unknown>;
		const models = (result.data as Array<Record<string, unknown>>) || [];
		return models.map((m) => ({
			id: (m.id as string) || "",
			name: (m.displayName as string) || (m.id as string) || "",
		}));
	}

	/** Reset the thread so the next turn starts fresh (avoids context accumulation). */
	resetThread(): void {
		this.threadId = null;
	}

	async shutdown(): Promise<void> {
		if (this.proc && !this.proc.killed) {
			this.proc.kill();
			this.proc = null;
		}
		this.initialized = false;
		this.threadId = null;
	}
}

const codex = new CodexAppServer();

export async function organizeWithAI(request: OrganizeRequest): Promise<OrganizeResponse> {
	// Start fresh thread for each organize call to avoid context accumulation
	codex.resetThread();

	const rules = storage.getRules();
	const memories = storage.getMemories();
	const settings = storage.getSettings();
	log(`[organize] Building prompt (${rules.length} rules, ${memories.length} memories)`);

	const systemPrompt = buildSystemPrompt(memories, settings.generalPrompt);
	const userPrompt = buildGroupingPrompt(request, rules);
	const toolHint = contentBridge.hasListeners()
		? "\n\nNote: If any tab's title/URL/meta are too ambiguous to confidently group, you have access to a get_page_content tool to fetch the full page text. Only use it for truly ambiguous tabs."
		: "";
	const fullPrompt = `${systemPrompt}${toolHint}\n\n${userPrompt}`;

	if (DEBUG) {
		const { writeFileSync } = await import("node:fs");
		writeFileSync("/tmp/tab-orga-last-prompt.txt", fullPrompt);
		log("[organize] Debug prompt saved to /tmp/tab-orga-last-prompt.txt");
	}

	const output = await codex.runTurn(fullPrompt, GROUPING_SCHEMA);

	try {
		const parsed = JSON.parse(output);
		return {
			suggestions: sanitizeSuggestions(parsed.suggestions),
			reasoning: parsed.reasoning,
		};
	} catch (e) {
		log(`[organize] Failed to parse Codex output: ${output.slice(0, 500)}`);
		throw new Error(`Failed to parse AI response: ${e instanceof Error ? e.message : e}`);
	}
}

export async function analyzeCorrections(
	originalSuggestions: GroupingSuggestion[],
	appliedSuggestions: GroupingSuggestion[],
	tabs: TabInfo[],
): Promise<string[]> {
	const prompt = `You are analyzing how a user modified AI-suggested tab groupings.

Original suggestions:
${JSON.stringify(originalSuggestions, null, 2)}

What the user actually applied:
${JSON.stringify(appliedSuggestions, null, 2)}

Tabs involved:
${tabs.map((t) => `- [${t.id}] ${t.title} (${t.url})`).join("\n")}

Identify patterns in the user's corrections. What preferences can you infer?
Return observations as short sentences (max 5).`;

	try {
		const output = await codex.runTurn(prompt, CORRECTIONS_SCHEMA);
		const parsed = JSON.parse(output);
		return Array.isArray(parsed.observations) ? parsed.observations : [];
	} catch {
		return [];
	}
}

const REFINE_SCHEMA = {
	type: "object",
	properties: {
		suggestions: GROUPING_SCHEMA.properties.suggestions,
		reasoning: { type: "string" },
		memories: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: ["suggestions", "reasoning", "memories"],
	additionalProperties: false,
};

export async function refineWithAI(
	suggestions: GroupingSuggestion[],
	tabs: TabInfo[],
	feedback: string,
	targetGroupName?: string,
	targetTabId?: number,
): Promise<{ suggestions: GroupingSuggestion[]; reasoning: string; memories: string[] }> {
	const memories = storage.getMemories();
	const settings = storage.getSettings();
	const systemPrompt = buildSystemPrompt(memories, settings.generalPrompt);

	let context = "";
	if (targetGroupName) {
		context = `\nThe user is giving feedback about the group "${targetGroupName}".`;
	}
	if (targetTabId) {
		const tab = tabs.find((t) => t.id === targetTabId);
		if (tab) {
			context = `\nThe user is giving feedback about the tab "${tab.title}" (${tab.url}).`;
		}
	}

	const prompt = `${systemPrompt}

You previously organized tabs into these groups:
${JSON.stringify(suggestions, null, 2)}

Tabs:
${tabs.map((t) => `- [${t.id}] ${t.title} (${t.url})`).join("\n")}
${context}
User feedback: "${feedback}"

Update the groupings based on the feedback. Return the complete updated suggestions array.
Also return a "memories" array with short preference observations to remember for future sessions (e.g., "User wants YouTube tabs ungrouped", "User prefers manga sites in a 'Reading' group"). Only include memories if the feedback reveals a reusable preference. Return empty array if the feedback is one-off.`;

	log(`[refine] Feedback: "${feedback}" (group=${targetGroupName}, tab=${targetTabId})`);
	const output = await codex.runTurn(prompt, REFINE_SCHEMA);

	try {
		const parsed = JSON.parse(output);
		return {
			suggestions: sanitizeSuggestions(parsed.suggestions),
			reasoning: parsed.reasoning,
			memories: Array.isArray(parsed.memories) ? parsed.memories : [],
		};
	} catch (e) {
		log(`[refine] Failed to parse Codex output: ${output.slice(0, 500)}`);
		throw new Error(`Failed to parse AI response: ${e instanceof Error ? e.message : e}`);
	}
}

const AI_EDIT_MEMORIES_SCHEMA = {
	type: "object",
	properties: {
		memories: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					observation: { type: "string" },
				},
				required: ["id", "observation"],
				additionalProperties: false,
			},
		},
		summary: { type: "string" },
	},
	required: ["memories", "summary"],
	additionalProperties: false,
};

export async function aiEditMemories(
	instruction: string,
): Promise<{ memories: Array<{ id: string; observation: string }>; summary: string }> {
	const currentMemories = storage.getMemories();

	const prompt = `You are managing a list of AI memories/preferences for a tab organizer.

Current memories:
${currentMemories.map((m) => `- [id: ${m.id}] "${m.observation}" (source: ${m.source}, created: ${m.createdAt})`).join("\n")}

User instruction: "${instruction}"

Based on the user's instruction, return the updated list of memories. You can:
- Edit observations to clarify/improve them
- Merge duplicate or similar memories into one
- Remove memories the user wants deleted
- Keep memories unchanged if they're fine

Return ALL memories that should remain (with their original IDs). If you merge memories, pick one ID to keep.
For the "summary" field, briefly describe what you changed.`;

	log(`[ai-edit-memories] Instruction: "${instruction}"`);
	const output = await codex.runTurn(prompt, AI_EDIT_MEMORIES_SCHEMA);

	try {
		const parsed = JSON.parse(output);
		return {
			memories: parsed.memories || [],
			summary: parsed.summary || "Done",
		};
	} catch (e) {
		log(`[ai-edit-memories] Failed to parse: ${output.slice(0, 500)}`);
		throw new Error(`Failed to parse AI response: ${e instanceof Error ? e.message : e}`);
	}
}

const SCREENSHOT_SUMMARY_SCHEMA = {
	type: "object",
	properties: {
		summaries: {
			type: "array",
			items: {
				type: "object",
				properties: {
					tabId: { type: "number" },
					summary: { type: "string" },
				},
				required: ["tabId", "summary"],
				additionalProperties: false,
			},
		},
	},
	required: ["summaries"],
	additionalProperties: false,
};

export async function summarizeScreenshots(
	screenshots: Array<{ tabId: number; image: string; title: string; url: string }>,
): Promise<Array<{ tabId: number; summary: string }>> {
	// Process in batches of 4 to avoid overloading the context
	const batchSize = 4;
	const allSummaries: Array<{ tabId: number; summary: string }> = [];

	for (let i = 0; i < screenshots.length; i += batchSize) {
		const batch = screenshots.slice(i, i + batchSize);

		const tabList = batch.map((s) => `- Tab ${s.tabId}: "${s.title}" (${s.url})`).join("\n");

		const prompt = `You are analyzing browser tab screenshots to create searchable text summaries.

For each screenshot below, write a detailed text summary (2-4 sentences) that captures:
- The main topic/purpose of the page
- Key visible text content, numbers, names, addresses, dates
- Any important details a user might search for (phone numbers, zip codes, product names, prices, etc.)

Tabs:
${tabList}

The screenshots are provided in order. Return a summary for each tab.`;

		const images = batch.map((s) => ({ base64: s.image }));

		try {
			const output = await codex.runTurn(prompt, SCREENSHOT_SUMMARY_SCHEMA, images);
			const parsed = JSON.parse(output);
			if (Array.isArray(parsed.summaries)) {
				allSummaries.push(...parsed.summaries);
			}
		} catch (e) {
			log(`[summarize] Batch failed: ${e}`);
			// Return empty summaries for failed batch
			for (const s of batch) {
				allSummaries.push({ tabId: s.tabId, summary: "" });
			}
		}
	}

	return allSummaries;
}

export async function getAvailableModels(): Promise<Array<{ id: string; name: string }>> {
	return codex.listModels();
}

export async function checkCodexHealth(): Promise<boolean> {
	try {
		await codex.ensureRunning();
		return true;
	} catch {
		return false;
	}
}
