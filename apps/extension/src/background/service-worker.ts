import type { TabInfo } from "@tab-orga/shared";
import { clientDebug } from "../sidepanel/services/clientDebug.js";
import {
	getTabsNeedingStage1,
	getTabsNeedingStage2,
	runScreenshotScan,
	runStage1SummaryScan,
	type StoredSummaryScanProgress,
	SUMMARY_SCAN_MESSAGE_TYPE,
	SUMMARY_SCAN_PROGRESS_KEY,
	type SummaryScanKind,
	type SummaryScanPriority,
} from "../sidepanel/services/screenshotCache.js";

const SUMMARY_SCAN_ALARM = "tab-summary-scan";
const SUMMARY_SCAN_PERIOD_MINUTES = 15;
const STAGE1_NORMAL_CONCURRENCY = 4;
const STAGE1_FAST_CONCURRENCY = 10;
const STAGE2_CONCURRENCY = 10;
let scanPromise: Promise<void> | null = null;
let activeScanPriority: SummaryScanPriority = "normal";
let activeScanKind: SummaryScanKind = "stage1";
let stage2ScanGeneration = 0;
let stage2CancelledAfter = 0;

chrome.action.onClicked.addListener(() => {
	chrome.sidePanel.setOptions({ enabled: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

function toTabInfo(tab: chrome.tabs.Tab): TabInfo | null {
	if (tab.id === undefined || !tab.url?.startsWith("http")) return null;
	return {
		id: tab.id,
		windowId: tab.windowId,
		url: tab.url,
		title: tab.title || "",
		favIconUrl: tab.favIconUrl,
		groupId: tab.groupId ?? chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
	};
}

async function writeProgress(progress: StoredSummaryScanProgress): Promise<void> {
	await chrome.storage.local.set({ [SUMMARY_SCAN_PROGRESS_KEY]: progress });
}

function priorityConcurrency(): number {
	if (activeScanKind === "stage2") return STAGE2_CONCURRENCY;
	return activeScanPriority === "fast" ? STAGE1_FAST_CONCURRENCY : STAGE1_NORMAL_CONCURRENCY;
}

function upgradeScan(priority: SummaryScanPriority, kind: SummaryScanKind): void {
	if (kind === "stage2") activeScanKind = "stage2";
	if (priority === "fast") activeScanPriority = "fast";
}

function scheduleSummaryScan(delayInMinutes = 0.5): void {
	chrome.alarms.create(SUMMARY_SCAN_ALARM, {
		delayInMinutes,
		periodInMinutes: SUMMARY_SCAN_PERIOD_MINUTES,
	});
}

async function scanMissingSummaries(
	kind: SummaryScanKind = "stage1",
	priority: SummaryScanPriority = "normal",
	allowScreenshots = false,
	requestedAt = Date.now(),
): Promise<void> {
	const requestedKind = kind === "stage2" && !allowScreenshots ? "stage1" : kind;
	clientDebug("summary-bg", "scan requested", { kind, priority, allowScreenshots, requestedKind });
	if (kind === "stage2" && !allowScreenshots) {
		console.warn("[summary-scan] Ignoring Stage 2 request without explicit screenshot permission");
		clientDebug("summary-bg", "blocked Stage 2 request without explicit screenshot permission");
	}
	if (requestedKind === "stage2" && requestedAt <= stage2CancelledAfter) {
		clientDebug("summary-bg", "dropped stale Stage 2 scan request after organize started", {
			requestedAt,
			stage2CancelledAfter,
		});
		return;
	}
	if (scanPromise) {
		if (activeScanKind === "stage2" && requestedKind === "stage1") {
			stage2ScanGeneration++;
			stage2CancelledAfter = Date.now();
			clientDebug("summary-bg", "cancelled active Stage 2 scan for fast Stage 1 request", {
				stage2ScanGeneration,
			});
		}
		upgradeScan(priority, requestedKind);
		if (requestedKind === "stage2") {
			return scanPromise.then(() =>
				scanMissingSummaries(requestedKind, priority, allowScreenshots, requestedAt),
			);
		}
		return scanPromise;
	}
	upgradeScan(priority, requestedKind);

	scanPromise = (async () => {
		const tabs = (await chrome.tabs.query({}))
			.map(toTabInfo)
			.filter((tab): tab is TabInfo => tab !== null);
		const effectiveKind = activeScanKind;
		const missing =
			effectiveKind === "stage2"
				? await getTabsNeedingStage2(tabs)
				: await getTabsNeedingStage1(tabs);
		console.log(`[summary-scan] ${missing.length}/${tabs.length} tabs need ${effectiveKind}`);
		if (missing.length === 0) {
			await writeProgress({
				kind: effectiveKind,
				phase: "done",
				done: 0,
				total: 0,
				running: false,
				updatedAt: Date.now(),
			});
			return;
		}

		const runner = effectiveKind === "stage2" ? runScreenshotScan : runStage1SummaryScan;
		const scanGeneration = stage2ScanGeneration;
		clientDebug("summary-bg", "scan started", {
			kind: effectiveKind,
			missing: missing.length,
			totalTabs: tabs.length,
		});
		await runner(
			tabs,
			(progress) => {
				void writeProgress({
					...progress,
					running: progress.phase !== "done",
					updatedAt: Date.now(),
				});
			},
			missing,
			{
				getConcurrency: priorityConcurrency,
				shouldCancel:
					effectiveKind === "stage2" ? () => scanGeneration !== stage2ScanGeneration : undefined,
			},
		);
		clientDebug("summary-bg", "scan finished", { kind: effectiveKind, missing: missing.length });
	})().finally(() => {
		scanPromise = null;
		activeScanPriority = "normal";
		activeScanKind = "stage1";
	});

	return scanPromise;
}

function startSummaryScan(
	kind: SummaryScanKind = "stage1",
	priority: SummaryScanPriority = "normal",
	allowScreenshots = false,
): void {
	void scanMissingSummaries(kind, priority, allowScreenshots).catch((error) => {
		console.warn("[summary-scan] Failed:", error);
	});
}

chrome.runtime.onInstalled.addListener(() => {
	scheduleSummaryScan(0.5);
	startSummaryScan();
});

chrome.runtime.onStartup.addListener(() => {
	scheduleSummaryScan(0.5);
	startSummaryScan();
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === SUMMARY_SCAN_ALARM) {
		startSummaryScan();
	}
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
	const scanMessage = message as {
		type?: string;
		kind?: SummaryScanKind;
		priority?: SummaryScanPriority;
		allowScreenshots?: boolean;
	};
	if (scanMessage.type !== SUMMARY_SCAN_MESSAGE_TYPE) return false;
	startSummaryScan(
		scanMessage.kind || "stage1",
		scanMessage.priority || "normal",
		scanMessage.allowScreenshots === true,
	);
	sendResponse({ ok: true });
	return false;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
	if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
		scheduleSummaryScan();
	}
});
