import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { contentBridge } from "../services/content-bridge.js";

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

// Called by the MCP server process to request content extraction
contentBridgeRoute.post("/content-bridge/request", async (c) => {
	const body = await c.req.json();
	const tabIds = body.tabIds as number[];
	if (!Array.isArray(tabIds) || tabIds.length === 0) {
		return c.json({ error: "tabIds array required" }, 400);
	}

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
	const body = await c.req.json();
	const { requestId, tabId, content } = body;
	if (!requestId || tabId === undefined) {
		return c.json({ error: "requestId and tabId required" }, 400);
	}
	contentBridge.submitContent(requestId, tabId, content || "");
	return c.json({ ok: true });
});
