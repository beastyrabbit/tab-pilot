import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { contentBridge } from "../services/content-bridge.js";

// Shared secret generated at startup — must be included as X-Bridge-Token header
// by any caller of the content-bridge mutation endpoints.
const BRIDGE_TOKEN = crypto.randomUUID();

export function getBridgeToken(): string {
	return BRIDGE_TOKEN;
}

export const contentBridgeRoute = new Hono();

contentBridgeRoute.get("/content-bridge/events", (c) => {
	return streamSSE(c, async (stream) => {
		let aborted = false;
		stream.onAbort(() => {
			aborted = true;
		});

		console.log("[content-bridge] SSE client connected");

		const handler = (data: { requestId: string; tabIds: number[] }) => {
			if (aborted) return;
			stream
				.writeSSE({
					event: "content-request",
					data: JSON.stringify(data),
				})
				.catch(() => {});
		};

		contentBridge.on("content-request", handler);

		// Keep alive with periodic pings
		while (!aborted) {
			await stream.sleep(15000);
			if (!aborted) {
				await stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
			}
		}

		contentBridge.off("content-request", handler);
		console.log("[content-bridge] SSE client disconnected");
	});
});

const ContentRequestSchema = z.object({
	tabIds: z.array(z.number()).min(1),
});

const ContentResultSchema = z.object({
	requestId: z.string().min(1),
	tabId: z.number(),
	content: z.string().default(""),
});

function requireBridgeToken(c: { req: { header: (name: string) => string | undefined } }) {
	return c.req.header("x-bridge-token") === BRIDGE_TOKEN;
}

// Called by the MCP server process to request content extraction
contentBridgeRoute.post("/content-bridge/request", async (c) => {
	if (!requireBridgeToken(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const parsed = ContentRequestSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "tabIds array required" }, 400);
	}
	const { tabIds } = parsed.data;

	if (!contentBridge.hasListeners()) {
		return c.json(
			{ error: "No browser extension connected. Content bridge has no SSE listeners." },
			503,
		);
	}

	const contentMap = await contentBridge.requestContent(tabIds);
	const results: Record<string, string> = {};
	for (const [tabId, content] of contentMap) {
		results[String(tabId)] = content;
	}
	return c.json({ results });
});

contentBridgeRoute.post("/content-bridge/results", async (c) => {
	if (!requireBridgeToken(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const parsed = ContentResultSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "requestId and tabId required" }, 400);
	}
	const { requestId, tabId, content } = parsed.data;
	contentBridge.submitContent(requestId, tabId, content);
	return c.json({ ok: true });
});
