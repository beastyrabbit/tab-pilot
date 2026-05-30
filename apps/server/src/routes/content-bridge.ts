import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { contentBridge } from "../services/content-bridge.js";

// Shared secret generated at startup — must be included as X-Bridge-Token header
// by any caller of the content-bridge mutation endpoints.
const BRIDGE_TOKEN = crypto.randomUUID();
const CONFIGURED_EXTENSION_ORIGIN = process.env.TAB_ORGA_EXTENSION_ID
	? `chrome-extension://${process.env.TAB_ORGA_EXTENSION_ID}`
	: null;
let trustedExtensionOrigin: string | null = CONFIGURED_EXTENSION_ORIGIN;

export function getBridgeToken(): string {
	return BRIDGE_TOKEN;
}

export const contentBridgeRoute = new Hono();

function allowExtensionOrigin(origin: string): boolean {
	if (!origin) return true;
	if (!origin.startsWith("chrome-extension://")) return false;
	if (trustedExtensionOrigin) return origin === trustedExtensionOrigin;
	trustedExtensionOrigin = origin;
	console.warn(`[content-bridge] Trusting extension origin for this server run: ${origin}`);
	return true;
}

/**
 * Token endpoint — only allows chrome-extension:// origins.
 * Non-browser local callers are not subject to CORS.
 */
contentBridgeRoute.get("/content-bridge/token", (c) => {
	const origin = c.req.header("origin") || "";
	if (!allowExtensionOrigin(origin)) {
		return c.json({ error: "Forbidden" }, 403);
	}
	// Set restrictive CORS for this endpoint only
	c.header("Access-Control-Allow-Origin", origin || "null");
	return c.json({ token: BRIDGE_TOKEN });
});

contentBridgeRoute.get("/content-bridge/events", (c) => {
	const origin = c.req.header("origin") || "";
	if (!allowExtensionOrigin(origin)) {
		return c.json({ error: "Forbidden" }, 403);
	}
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
	content: z.string().max(10_000).default(""),
});

function requireBridgeToken(c: { req: { header: (name: string) => string | undefined } }) {
	return c.req.header("x-bridge-token") === BRIDGE_TOKEN;
}

// Optional local bridge endpoint for requesting extension-side content extraction.
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
