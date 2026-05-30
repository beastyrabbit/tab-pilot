import { extractTabContent } from "./chromeContentApi.js";

const BASE_URL = "http://127.0.0.1:7777/api";

// Bridge token obtained from dedicated token endpoint (restricted to chrome-extension:// origins)
let bridgeToken: string | null = null;

async function fetchBridgeToken(): Promise<string> {
	const res = await fetch(`${BASE_URL}/content-bridge/token`);
	const data = (await res.json()) as { token?: string };
	bridgeToken = data.token || "";
	return bridgeToken;
}

async function ensureBridgeToken(): Promise<string> {
	if (bridgeToken) return bridgeToken;
	return fetchBridgeToken();
}

/**
 * Opens an SSE connection to the server's content bridge.
 * When the AI requests full page content for specific tabs,
 * this extracts the content and sends it back.
 *
 * Returns a cleanup function to close the connection.
 */
export function startContentBridge(): () => void {
	const es = new EventSource(`${BASE_URL}/content-bridge/events`);

	es.addEventListener("content-request", async (event) => {
		try {
			const { requestId, tabIds } = JSON.parse(event.data) as {
				requestId: string;
				tabIds: number[];
			};
			console.log(`[content-bridge] AI requested content for tabs: ${tabIds.join(", ")}`);

			const token = await ensureBridgeToken();

			// Extract content for each tab in parallel
			const extractions = tabIds.map(async (tabId) => {
				const content = await extractTabContent(tabId, true);
				const text = content?.pageText || content?.metaDescription || "";

				const res = await fetch(`${BASE_URL}/content-bridge/results`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Bridge-Token": token,
					},
					body: JSON.stringify({ requestId, tabId, content: text }),
				});

				// If token is stale (server restarted), re-fetch and retry once
				if (res.status === 401) {
					const newToken = await fetchBridgeToken();
					await fetch(`${BASE_URL}/content-bridge/results`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Bridge-Token": newToken,
						},
						body: JSON.stringify({ requestId, tabId, content: text }),
					});
				}
			});

			await Promise.allSettled(extractions);
		} catch (e) {
			console.error("[content-bridge] Error handling content request:", e);
		}
	});

	es.onerror = () => {
		// EventSource auto-reconnects on transient server reloads and side panel pauses.
	};

	return () => {
		es.close();
		console.log("[content-bridge] SSE connection closed");
	};
}
