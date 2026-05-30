#!/usr/bin/env node
/**
 * MCP Server for Tab Organizer.
 * Exposes a `get_page_content` tool that the Codex AI can call
 * to fetch full page text from browser tabs via the content bridge.
 *
 * Runs as a stdio MCP server — Codex spawns this process and communicates via JSON-RPC.
 */
import { createInterface } from "node:readline";

const BRIDGE_URL = "http://localhost:7777/api";

let cachedBridgeToken: string | null = null;

async function getBridgeToken(forceRefresh = false): Promise<string> {
	if (!forceRefresh && cachedBridgeToken) return cachedBridgeToken;
	const res = await fetch(`${BRIDGE_URL}/content-bridge/token`);
	const data = (await res.json()) as { token?: string };
	cachedBridgeToken = data.token || "";
	return cachedBridgeToken;
}

// ── MCP Protocol Helpers ────────────────────────────────────────────────

function sendMessage(msg: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function sendResponse(id: number | string, result: unknown): void {
	sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id: number | string, code: number, message: string): void {
	sendMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── Tool Definition ─────────────────────────────────────────────────────

const TOOLS = [
	{
		name: "get_page_content",
		description:
			"Fetch the full text content of specific browser tabs. Use this when tab titles and meta descriptions are insufficient to determine the correct grouping. The content is extracted live from the user's open browser tabs. Only request tabs that are truly ambiguous — not all of them.",
		inputSchema: {
			type: "object",
			properties: {
				tabIds: {
					type: "array",
					items: { type: "number" },
					description: "IDs of tabs to fetch full page content for",
				},
				reason: {
					type: "string",
					description: "Brief explanation of why full content is needed",
				},
			},
			required: ["tabIds"],
		},
	},
];

// ── Tool Execution ──────────────────────────────────────────────────────

async function executeGetPageContent(args: { tabIds: number[]; reason?: string }): Promise<string> {
	const { tabIds, reason } = args;
	console.error(`[mcp] get_page_content: tabs=${tabIds.join(",")} reason="${reason || "none"}"`);

	// Check if content bridge has listeners (SSE clients connected)
	try {
		const checkRes = await fetch(`${BRIDGE_URL}/health`);
		if (!checkRes.ok) {
			return "Tab organizer server is not running. Proceed with available information.";
		}
	} catch {
		return "Tab organizer server is not reachable. Proceed with available information.";
	}

	// Request content via the bridge — this triggers an SSE event to the extension,
	// waits for the extension to extract and POST back, then returns.
	// We do this by calling the bridge's internal content request mechanism via HTTP.
	try {
		const token = await getBridgeToken();
		const res = await fetch(`${BRIDGE_URL}/content-bridge/request`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Bridge-Token": token,
			},
			body: JSON.stringify({ tabIds }),
		});
		// Retry once on 401 (stale token after server restart)
		if (res.status === 401) {
			const freshToken = await getBridgeToken(true);
			const retry = await fetch(`${BRIDGE_URL}/content-bridge/request`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bridge-Token": freshToken,
				},
				body: JSON.stringify({ tabIds }),
			});
			if (!retry.ok) {
				return `Failed to request content: ${await retry.text()}`;
			}
			const retryData = (await retry.json()) as { results: Record<string, string> };
			const retryResults: string[] = [];
			for (const tabId of tabIds) {
				const content = retryData.results[String(tabId)];
				retryResults.push(
					content
						? `[Tab ${tabId}]: ${content.slice(0, 2000)}`
						: `[Tab ${tabId}]: (content unavailable)`,
				);
			}
			return retryResults.join("\n\n");
		}
		if (!res.ok) {
			const err = await res.text();
			return `Failed to request content: ${err}`;
		}
		const data = (await res.json()) as { results: Record<string, string> };
		const results: string[] = [];
		for (const tabId of tabIds) {
			const content = data.results[String(tabId)];
			if (content) {
				results.push(`[Tab ${tabId}]: ${content.slice(0, 2000)}`);
			} else {
				results.push(`[Tab ${tabId}]: (content unavailable)`);
			}
		}
		return results.join("\n\n");
	} catch (e) {
		return `Error fetching content: ${e instanceof Error ? e.message : e}`;
	}
}

// ── Message Handler ─────────────────────────────────────────────────────

async function handleMessage(line: string): Promise<void> {
	let msg: Record<string, unknown>;
	try {
		msg = JSON.parse(line);
	} catch {
		return;
	}

	const id = msg.id as number | string;
	const method = msg.method as string;
	const params = (msg.params as Record<string, unknown>) || {};

	switch (method) {
		case "initialize":
			sendResponse(id, {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: {
					name: "tab-organizer-mcp",
					version: "0.1.0",
				},
			});
			break;

		case "notifications/initialized":
			// Client acknowledged — nothing to do
			break;

		case "tools/list":
			sendResponse(id, { tools: TOOLS });
			break;

		case "tools/call": {
			const toolName = params.name as string;
			const args = (params.arguments as Record<string, unknown>) || {};

			if (toolName === "get_page_content") {
				try {
					const result = await executeGetPageContent(args as { tabIds: number[]; reason?: string });
					sendResponse(id, {
						content: [{ type: "text", text: result }],
					});
				} catch (e) {
					sendError(id, -32000, e instanceof Error ? e.message : "Tool execution failed");
				}
			} else {
				sendError(id, -32601, `Unknown tool: ${toolName}`);
			}
			break;
		}

		default:
			if (id !== undefined) {
				sendError(id, -32601, `Method not found: ${method}`);
			}
	}
}

// ── Main ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => handleMessage(line));

console.error("[mcp] Tab Organizer MCP server started");
