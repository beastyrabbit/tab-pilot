import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
	GroupingSuggestion,
	OrganizeRequest,
	OrganizeResponse,
	TabInfo,
} from "@tab-orga/shared";
import { buildGroupingPrompt, buildSystemPrompt } from "../prompts/grouping.js";
import { storage } from "./storage.js";

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

	async ensureRunning(): Promise<void> {
		if (this.proc && !this.proc.killed && this.initialized) return;
		console.log("[codex] Starting app-server...");
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
			console.error("[codex stderr]", data.toString());
		});

		this.proc.on("exit", (code) => {
			console.error(`[codex] App-server exited with code ${code}`);
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
		console.log("[codex] App-server initialized");
	}

	private handleMessage(line: string): void {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}

		// Response to our request
		if ("id" in msg && typeof msg.id === "number") {
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

		// Notification from server
		const method = msg.method as string;
		const params = msg.params as Record<string, unknown> | undefined;
		// Capture agent message output from item/completed notifications
		if (method === "item/completed" && params) {
			const item = params.item as Record<string, unknown> | undefined;
			if (item?.type === "agentMessage" && typeof item.text === "string") {
				this.turnOutput = item.text;
			}
		}

		if (method === "turn/completed" && params) {
			const turn = params.turn as Record<string, unknown> | undefined;

			// Check for turn-level error
			if (turn?.status === "failed" && turn.error) {
				const err = turn.error as Record<string, unknown>;
				const errMsg = (err.message as string) || "Turn failed";
				console.error("[codex] Turn failed:", errMsg);
				if (this.turnResolve) {
					this.turnResolve("");
					this.turnResolve = null;
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
		console.log(`[codex] Starting thread with model=${settings.model}`);
		const result = (await this.send("thread/start", {
			model: settings.model,
			approvalPolicy: "never",
			sandboxPolicy: "readOnly",
		})) as { thread: { id: string } };
		this.threadId = result.thread.id;
		console.log(`[codex] Thread started: ${this.threadId}`);
		return this.threadId;
	}

	async runTurn(prompt: string, outputSchema: Record<string, unknown>): Promise<string> {
		await this.ensureRunning();

		if (!this.threadId) {
			await this.startThread();
		}

		console.log(`[codex] Starting turn (prompt length: ${prompt.length} chars)`);
		const startTime = Date.now();

		const outputPromise = new Promise<string>((resolve) => {
			this.turnResolve = resolve;
		});

		// Add a timeout
		const timeoutPromise = new Promise<string>((_, reject) => {
			setTimeout(() => reject(new Error("Codex turn timed out after 120s")), 120_000);
		});

		await this.send("turn/start", {
			threadId: this.threadId,
			input: [{ type: "text", text: prompt }],
			outputSchema,
		});

		const result = await Promise.race([outputPromise, timeoutPromise]);
		console.log(
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
	const rules = storage.getRules();
	const memories = storage.getMemories();
	console.log(`[organize] Building prompt (${rules.length} rules, ${memories.length} memories)`);

	const systemPrompt = buildSystemPrompt(memories);
	const userPrompt = buildGroupingPrompt(request, rules);
	const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

	const output = await codex.runTurn(fullPrompt, GROUPING_SCHEMA);

	try {
		const parsed = JSON.parse(output);
		return {
			suggestions: parsed.suggestions as GroupingSuggestion[],
			reasoning: parsed.reasoning,
		};
	} catch (e) {
		console.error("[organize] Failed to parse Codex output:", output.slice(0, 500));
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
