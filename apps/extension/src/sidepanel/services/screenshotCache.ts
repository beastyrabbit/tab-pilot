import type { TabInfo } from "@tab-orga/shared";
import { captureTabScreenshot } from "./chromeScreenshotApi.js";
import { serverApi } from "./serverApi.js";

// ── Public: get cached summaries for search (from server) ─────────────

export async function getCachedSummaries(tabs: TabInfo[]): Promise<Map<number, string>> {
	const urls = tabs.filter((t) => t.url.startsWith("http")).map((t) => t.url);
	if (urls.length === 0) return new Map();

	try {
		const summaries = await serverApi.lookupSummaries(urls);
		const result = new Map<number, string>();
		for (const tab of tabs) {
			const summary = summaries[tab.url];
			if (summary) result.set(tab.id, summary);
		}
		return result;
	} catch {
		return new Map();
	}
}

// ── Public: determine which tabs need new screenshots ─────────────────

export async function getTabsNeedingScreenshots(tabs: TabInfo[]): Promise<TabInfo[]> {
	const httpTabs = tabs.filter((t) => t.url.startsWith("http"));
	if (httpTabs.length === 0) return [];

	try {
		const cachedUrls = await serverApi.checkCachedUrls(httpTabs.map((t) => t.url));
		const needed = httpTabs.filter((t) => !cachedUrls.has(t.url));
		console.log(
			`[screenshot] ${needed.length}/${httpTabs.length} tabs need capture (${cachedUrls.size} cached)`,
		);
		return needed;
	} catch {
		// Server down — skip scanning
		return [];
	}
}

// ── Public: run screenshot scan in background ─────────────────────────

export interface ScanProgress {
	phase: "capturing" | "summarizing" | "done";
	done: number;
	total: number;
}

export async function runScreenshotScan(
	tabs: TabInfo[],
	onProgress?: (progress: ScanProgress) => void,
	preFiltered?: TabInfo[],
): Promise<void> {
	const needCapture = preFiltered ?? (await getTabsNeedingScreenshots(tabs));

	if (needCapture.length === 0) {
		onProgress?.({ phase: "done", done: 0, total: 0 });
		return;
	}

	// Phase 1: Capture screenshots
	const screenshots = new Map<number, string>();
	for (let i = 0; i < needCapture.length; i++) {
		const tab = needCapture[i];
		onProgress?.({ phase: "capturing", done: i, total: needCapture.length });

		const image = await captureTabScreenshot(tab.id, 10000);
		if (image) {
			screenshots.set(tab.id, image);
		}
	}
	onProgress?.({ phase: "capturing", done: needCapture.length, total: needCapture.length });

	if (screenshots.size === 0) {
		onProgress?.({ phase: "done", done: 0, total: 0 });
		return;
	}

	// Phase 2: Send to server for AI summarization (server auto-caches)
	onProgress?.({ phase: "summarizing", done: 0, total: screenshots.size });

	const payload = [...screenshots.entries()]
		.map(([tabId, image]) => {
			const tab = tabs.find((t) => t.id === tabId);
			if (!tab) return null; // tab closed during scan
			return { tabId, image, title: tab.title, url: tab.url };
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	// Chunk to match server's .max(10) limit on the screenshots array
	const BATCH_SIZE = 10;
	for (let i = 0; i < payload.length; i += BATCH_SIZE) {
		const batch = payload.slice(i, i + BATCH_SIZE);
		try {
			await serverApi.summarize(batch);
			console.log(`[screenshot] Summarized and cached ${batch.length} tabs on server`);
		} catch (e) {
			console.warn("[screenshot] Summarization batch failed:", e);
		}
	}

	onProgress?.({ phase: "done", done: screenshots.size, total: screenshots.size });
}
