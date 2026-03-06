import { extractTabContent } from "./chromeContentApi.js";
import { serverApi } from "./serverApi.js";

const BASE_URL = "http://localhost:7777/api";

// Bridge token obtained from server health endpoint
let bridgeToken: string | null = null;

async function ensureBridgeToken(): Promise<string> {
	if (bridgeToken) return bridgeToken;
	const health = (await serverApi.health()) as { bridgeToken?: string };
	bridgeToken = health.bridgeToken || "";
	return bridgeToken;
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

				await fetch(`${BASE_URL}/content-bridge/results`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Bridge-Token": token,
					},
					body: JSON.stringify({ requestId, tabId, content: text }),
				});
			});

			await Promise.allSettled(extractions);
		} catch (e) {
			console.error("[content-bridge] Error handling content request:", e);
		}
	});

	es.onerror = () => {
		// SSE will auto-reconnect on transient errors
		console.warn("[content-bridge] SSE connection error (will retry)");
	};

	return () => {
		es.close();
		console.log("[content-bridge] SSE connection closed");
	};
}
