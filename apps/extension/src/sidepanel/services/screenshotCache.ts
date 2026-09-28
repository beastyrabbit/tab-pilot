import type { TabInfo } from "@tab-orga/shared";
import { extractTabContent } from "./chromeContentApi.js";
import { captureTabScreenshot } from "./chromeScreenshotApi.js";
import { clientDebug } from "./clientDebug.js";
import { serverApi } from "./serverApi.js";

export type SummaryStatus = "stage2" | "stage1" | "missing" | "in-progress";
export type SummaryScanKind = "stage1" | "stage2";
export type SummaryScanPriority = "normal" | "fast";
export const SUMMARY_SCAN_PROGRESS_KEY = "tabSummaryScanProgress";
export const SUMMARY_SCAN_MESSAGE_TYPE = "tab-orga:scan-missing-summaries";

export interface ScanProgress {
	kind: SummaryScanKind;
	phase: "metadata" | "capturing" | "summarizing" | "done";
	done: number;
	total: number;
	activeTabIds?: number[];
}

export interface StoredSummaryScanProgress extends ScanProgress {
	running: boolean;
	updatedAt: number;
}

export interface SummaryScanOptions {
	concurrency?: number;
	getConcurrency?: () => number;
	shouldCancel?: () => boolean;
}

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

export async function getSummaryStatuses(tabs: TabInfo[]): Promise<Map<number, SummaryStatus>> {
	const statuses = new Map<number, SummaryStatus>();
	const httpTabs = tabs.filter((t) => t.url.startsWith("http"));
	for (const tab of tabs) {
		statuses.set(tab.id, "missing");
	}
	if (httpTabs.length === 0) return statuses;

	try {
		const availability = await serverApi.lookupSummaryAvailability(httpTabs.map((t) => t.url));
		for (const tab of httpTabs) {
			const stage = availability[tab.url]?.stage;
			statuses.set(
				tab.id,
				stage === "stage2" ? "stage2" : stage === "stage1" ? "stage1" : "missing",
			);
		}
	} catch {
		// Keep missing status when the server is offline or cache lookup fails.
	}
	return statuses;
}

export async function requestBackgroundSummaryScan(
	kind: SummaryScanKind = "stage1",
	priority: SummaryScanPriority = "normal",
	options: { allowScreenshots?: boolean } = {},
): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
	try {
		clientDebug("summary", "requesting background summary scan", {
			kind,
			priority,
			allowScreenshots: options.allowScreenshots === true,
		});
		await chrome.runtime.sendMessage({
			type: SUMMARY_SCAN_MESSAGE_TYPE,
			kind,
			priority,
			allowScreenshots: options.allowScreenshots === true,
		});
	} catch {
		// The side panel can still work without the background worker in tests/dev pages.
	}
}

export async function getTabsNeedingStage1(tabs: TabInfo[]): Promise<TabInfo[]> {
	const httpTabs = tabs.filter((t) => t.url.startsWith("http"));
	if (httpTabs.length === 0) return [];

	try {
		const state = await serverApi.checkSummaryState(
			httpTabs.map((t) => t.url),
			"stage1",
			httpTabs.map((tab) => ({ url: tab.url, title: tab.title })),
		);
		return httpTabs.filter((t) => !state.cached.has(t.url) && !state.stage1Blocked.has(t.url));
	} catch {
		return [];
	}
}

export async function getTabsNeedingStage2(tabs: TabInfo[]): Promise<TabInfo[]> {
	const httpTabs = tabs.filter((t) => t.url.startsWith("http"));
	if (httpTabs.length === 0) return [];

	try {
		const cachedUrls = await serverApi.checkCachedUrls(
			httpTabs.map((t) => t.url),
			"stage2",
			httpTabs.map((tab) => ({ url: tab.url, title: tab.title })),
		);
		return httpTabs.filter((t) => !cachedUrls.has(t.url));
	} catch {
		return [];
	}
}

export const getTabsNeedingScreenshots = getTabsNeedingStage2;

function clampConcurrency(value: number, total: number): number {
	return Math.max(1, Math.min(total, Math.floor(value) || 1));
}

async function runConcurrent(
	total: number,
	getConcurrency: () => number,
	processIndex: (index: number) => Promise<void>,
): Promise<void> {
	let nextIndex = 0;
	let activeWorkers = 0;
	let finished = 0;

	await new Promise<void>((resolve) => {
		let intervalId: ReturnType<typeof setInterval> | undefined;
		const launch = () => {
			while (activeWorkers < getConcurrency() && nextIndex < total) {
				const index = nextIndex++;
				activeWorkers++;
				void processIndex(index)
					.catch((error) => {
						console.warn("[summary] Failed to process tab:", error);
					})
					.finally(() => {
						activeWorkers--;
						finished++;
						if (finished >= total) {
							if (intervalId !== undefined) clearInterval(intervalId);
							resolve();
							return;
						}
						launch();
					});
			}
		};
		intervalId = setInterval(launch, 500);
		launch();
	});
}

export async function runStage1SummaryScan(
	tabs: TabInfo[],
	onProgress?: (progress: ScanProgress) => void,
	preFiltered?: TabInfo[],
	options: SummaryScanOptions = {},
): Promise<void> {
	const needSummary = preFiltered ?? (await getTabsNeedingStage1(tabs));
	if (needSummary.length === 0) {
		onProgress?.({ kind: "stage1", phase: "done", done: 0, total: 0 });
		return;
	}

	const activeTabIds = new Set<number>();
	let completed = 0;
	const getConcurrency = () =>
		clampConcurrency(options.getConcurrency?.() ?? options.concurrency ?? 4, needSummary.length);
	const inputs = new Map<
		number,
		{
			tabId: number;
			title: string;
			url: string;
			metaDescription?: string;
			ogDescription?: string;
			keywords?: string;
		}
	>();

	const emitProgress = (phase: ScanProgress["phase"]) => {
		onProgress?.({
			kind: "stage1",
			phase,
			done: completed,
			total: needSummary.length,
			activeTabIds: [...activeTabIds],
		});
	};

	await runConcurrent(needSummary.length, getConcurrency, async (index) => {
		const tab = needSummary[index];
		activeTabIds.add(tab.id);
		emitProgress("metadata");
		try {
			const metadata = await extractTabContent(tab.id, false);
			inputs.set(tab.id, {
				tabId: tab.id,
				title: tab.title,
				url: tab.url,
				metaDescription: metadata?.metaDescription || undefined,
				ogDescription: metadata?.ogDescription || undefined,
				keywords: metadata?.keywords || undefined,
			});
		} catch (error) {
			console.warn(`[stage1] Metadata failed for tab ${tab.id}:`, error);
		} finally {
			completed++;
			activeTabIds.delete(tab.id);
			emitProgress("metadata");
		}
	});

	let summarized = 0;
	const prepared = [...inputs.values()];
	for (let index = 0; index < prepared.length; index += 10) {
		const batch = prepared.slice(index, index + 10);
		for (const item of batch) activeTabIds.add(item.tabId);
		emitProgress("summarizing");
		try {
			const result = await serverApi.summarizeStage1(batch);
			const successful = new Set(
				result.summaries.filter((summary) => summary.summary).map((summary) => summary.tabId),
			);
			summarized += successful.size;
			const failures = batch
				.filter((item) => !successful.has(item.tabId))
				.map((item) => ({ url: item.url, reason: "Stage 1 returned no summary" }));
			if (failures.length > 0) await serverApi.markStage1Failures(failures);
		} catch (error) {
			await serverApi
				.markStage1Failures(
					batch.map((item) => ({
						url: item.url,
						reason: error instanceof Error ? error.message : "Stage 1 batch failed",
					})),
				)
				.catch(() => {});
		} finally {
			for (const item of batch) activeTabIds.delete(item.tabId);
		}
	}

	onProgress?.({ kind: "stage1", phase: "done", done: summarized, total: needSummary.length });
}

export async function runScreenshotScan(
	tabs: TabInfo[],
	onProgress?: (progress: ScanProgress) => void,
	preFiltered?: TabInfo[],
	options: SummaryScanOptions = {},
): Promise<void> {
	const needCapture = preFiltered ?? (await getTabsNeedingStage2(tabs));

	if (needCapture.length === 0) {
		onProgress?.({ kind: "stage2", phase: "done", done: 0, total: 0 });
		return;
	}

	const activeTabIds = new Set<number>();
	let completed = 0;
	let summarized = 0;
	const prepared: Array<{
		tabId: number;
		image: string;
		title: string;
		url: string;
		metaDescription?: string;
		ogDescription?: string;
		keywords?: string;
	}> = [];
	const getConcurrency = () =>
		clampConcurrency(options.getConcurrency?.() ?? options.concurrency ?? 1, needCapture.length);

	const emitProgress = (phase: ScanProgress["phase"]) => {
		onProgress?.({
			kind: "stage2",
			phase,
			done: completed,
			total: needCapture.length,
			activeTabIds: [...activeTabIds],
		});
	};

	await runConcurrent(needCapture.length, getConcurrency, async (index) => {
		if (options.shouldCancel?.()) {
			completed++;
			emitProgress("capturing");
			return;
		}
		const tab = needCapture[index];
		activeTabIds.add(tab.id);
		emitProgress("capturing");
		clientDebug("stage2", "capturing screenshot", { tabId: tab.id });
		const image = await captureTabScreenshot(tab.id, 2_000);
		if (!image) {
			completed++;
			activeTabIds.delete(tab.id);
			emitProgress("capturing");
			return;
		}
		if (options.shouldCancel?.()) {
			completed++;
			activeTabIds.delete(tab.id);
			emitProgress("capturing");
			return;
		}

		try {
			const metadata = await extractTabContent(tab.id, false);
			prepared.push({
				tabId: tab.id,
				image,
				title: tab.title,
				url: tab.url,
				metaDescription: metadata?.metaDescription || undefined,
				ogDescription: metadata?.ogDescription || undefined,
				keywords: metadata?.keywords || undefined,
			});
		} catch (error) {
			console.warn(`[stage2] Summarization failed for tab ${tab.id}:`, error);
		} finally {
			completed++;
			activeTabIds.delete(tab.id);
			emitProgress("capturing");
		}
	});
	for (let index = 0; index < prepared.length; index += 4) {
		if (options.shouldCancel?.()) break;
		const batch = prepared.slice(index, index + 4);
		for (const item of batch) activeTabIds.add(item.tabId);
		emitProgress("summarizing");
		try {
			const result = await serverApi.summarize(batch);
			summarized += result.summaries.filter((summary) => summary.summary).length;
		} catch (error) {
			console.warn("[stage2] Summarization batch failed:", error);
		} finally {
			for (const item of batch) activeTabIds.delete(item.tabId);
		}
	}

	onProgress?.({ kind: "stage2", phase: "done", done: summarized, total: needCapture.length });
}
