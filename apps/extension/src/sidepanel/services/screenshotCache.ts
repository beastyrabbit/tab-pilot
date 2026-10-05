import type { TabInfo } from "@tab-orga/shared";
import { extractTabContent } from "./chromeContentApi.js";
import { captureTabScreenshot } from "./chromeScreenshotApi.js";
import { clientDebug } from "./clientDebug.js";
import { complete } from "./proxyAi.js";
export type SummaryStatus = "stage2" | "stage1" | "missing" | "in-progress";
export type SummaryScanKind = "stage1" | "stage2";
export type SummaryScanPriority = "normal" | "fast";
export const SUMMARY_SCAN_PROGRESS_KEY = "tabSummaryScanProgress";
export const SUMMARY_SCAN_MESSAGE_TYPE = "tab-orga:scan-missing-summaries";
export interface ScanProgress {
	running?: boolean;
	updatedAt: number;
	kind: SummaryScanKind;
	phase: "metadata" | "capturing" | "summarizing" | "done";
	done: number;
	total: number;
	activeTabIds?: number[];
}
const KEY = "tab-orga-summary-cache";
async function cache(): Promise<Record<string, string>> {
	const r = await chrome.storage.local.get(KEY);
	return (r[KEY] as Record<string, string> | undefined) ?? {};
}
async function save(url: string, summary: string) {
	const c = await cache();
	c[url] = summary;
	await chrome.storage.local.set({ [KEY]: c });
}
export async function getTabsNeedingStage1(tabs: TabInfo[]) {
	const c = await cache();
	return tabs.filter((t) => !c[t.url]);
}
export async function getTabsNeedingStage2(tabs: TabInfo[]) {
	return getTabsNeedingStage1(tabs);
}
export async function requestBackgroundSummaryScan(
	kind: SummaryScanKind,
	priority: SummaryScanPriority = "normal",
	options?: { allowScreenshots?: boolean },
) {
	return;
}
async function summarizeTab(tab: TabInfo, image?: string) {
	const r = await chrome.storage.local.get("tab-orga-settings");
	const settings = r["tab-orga-settings"] as import("@tab-orga/shared").PublicSettings | undefined;
	if (!settings) return;
	const m = await extractTabContent(tab.id, false);
	const prompt = `Summarize this browser tab in one concise sentence. Title: ${tab.title}\nURL: ${tab.url}\nDescription: ${m?.metaDescription ?? ""}`;
	const text = await complete(settings, prompt);
	if (text) await save(tab.url, text);
}
export async function runStage1SummaryScan(
	tabs: TabInfo[],
	onProgress?: (p: ScanProgress) => void,
	preFiltered?: TabInfo[],
	options?: unknown,
) {
	const todo = preFiltered ?? (await getTabsNeedingStage1(tabs));
	let done = 0;
	for (const tab of todo) {
		onProgress?.({
			kind: "stage1",
			phase: "summarizing",
			done,
			total: todo.length,
			activeTabIds: [tab.id],
			updatedAt: Date.now(),
		});
		try {
			await summarizeTab(tab);
		} catch (e) {
			clientDebug("stage1", "failed", { error: String(e) });
		}
		done++;
	}
	onProgress?.({ kind: "stage1", phase: "done", done, total: todo.length, updatedAt: Date.now() });
}
export async function runScreenshotScan(
	tabs: TabInfo[],
	onProgress?: (p: ScanProgress) => void,
	preFiltered?: TabInfo[],
	options?: unknown,
) {
	const todo = preFiltered ?? (await getTabsNeedingStage2(tabs));
	let done = 0;
	for (const tab of todo) {
		try {
			const image = await captureTabScreenshot(tab.id, 10000);
			await summarizeTab(tab, image ?? undefined);
		} catch (e) {
			clientDebug("stage2", "failed", { error: String(e) });
		}
		done++;
		onProgress?.({
			kind: "stage2",
			phase: "capturing",
			done,
			total: todo.length,
			updatedAt: Date.now(),
		});
	}
	onProgress?.({ kind: "stage2", phase: "done", done, total: todo.length, updatedAt: Date.now() });
}
export interface StoredSummaryScanProgress extends ScanProgress {}
export async function getCachedSummaries(tabs: TabInfo[]): Promise<Map<number, string>> {
	const c = await cache();
	return new Map(tabs.filter((t) => c[t.url]).map((t) => [t.id, c[t.url]]));
}
export async function getSummaryStatuses(tabs: TabInfo[]): Promise<Map<number, SummaryStatus>> {
	const c = await cache();
	return new Map(tabs.map((t) => [t.id, c[t.url] ? "stage1" : "missing"]));
}
