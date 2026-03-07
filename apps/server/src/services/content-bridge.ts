import { EventEmitter } from "node:events";

interface PendingRequest {
	tabIds: number[];
	resolve: (content: Map<number, string>) => void;
	results: Map<number, string>;
	remaining: Set<number>;
	timeout: ReturnType<typeof setTimeout>;
}

class ContentBridge extends EventEmitter {
	private pendingRequests = new Map<string, PendingRequest>();

	/**
	 * Request full page content for specific tabs.
	 * Called by the AI tool — blocks until the extension extracts and returns the content.
	 */
	requestContent(tabIds: number[]): Promise<Map<number, string>> {
		const requestId = crypto.randomUUID();
		console.log(
			`[content-bridge] Requesting content for tabs: ${tabIds.join(", ")} (req=${requestId})`,
		);

		return new Promise<Map<number, string>>((resolve) => {
			const timeout = setTimeout(() => {
				console.warn(`[content-bridge] Timeout for request ${requestId}`);
				const pending = this.pendingRequests.get(requestId);
				if (pending) {
					this.pendingRequests.delete(requestId);
					resolve(pending.results); // return whatever we got
				}
			}, 30000); // 30s timeout

			this.pendingRequests.set(requestId, {
				tabIds,
				resolve,
				results: new Map(),
				remaining: new Set(tabIds),
				timeout,
			});

			// Notify connected SSE clients
			this.emit("content-request", { requestId, tabIds });
		});
	}

	/**
	 * Submit extracted content from the extension.
	 */
	submitContent(requestId: string, tabId: number, content: string): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) {
			console.warn(`[content-bridge] No pending request for ${requestId}`);
			return;
		}

		pending.results.set(tabId, content);
		pending.remaining.delete(tabId);
		console.log(
			`[content-bridge] Got content for tab ${tabId} (${content.length} chars), ${pending.remaining.size} remaining`,
		);

		if (pending.remaining.size === 0) {
			clearTimeout(pending.timeout);
			this.pendingRequests.delete(requestId);
			pending.resolve(pending.results);
		}
	}

	hasListeners(): boolean {
		return this.listenerCount("content-request") > 0;
	}
}

export const contentBridge = new ContentBridge();
