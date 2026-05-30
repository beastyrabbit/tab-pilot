import { clientDebug } from "./clientDebug.js";

const isChromeExtension = typeof chrome !== "undefined" && !!chrome.tabs;
const DEBUGGER_TIMEOUT_MS = 10_000;
const DEBUGGER_DETACH_TIMEOUT_MS = 3_000;

async function withTimeout<T>(
	promise: Promise<T>,
	label: string,
	timeoutMs = DEBUGGER_TIMEOUT_MS,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(`${label} timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}

/**
 * Capture a full-page screenshot of a tab (up to maxHeight pixels)
 * using the Chrome DevTools Protocol via chrome.debugger.
 * Returns a base64-encoded JPEG or null on failure.
 */
export async function captureTabScreenshot(
	tabId: number,
	maxHeight = 10000,
): Promise<string | null> {
	if (!isChromeExtension || !chrome.debugger) return null;

	let attached = false;
	let attachTimedOut = false;
	const target = { tabId };
	try {
		clientDebug("stage2", "attaching Chrome debugger for screenshot", { tabId });
		const attachPromise = chrome.debugger.attach(target, "1.3").then(async () => {
			attached = true;
			if (attachTimedOut) {
				await chrome.debugger.detach(target).catch(() => {});
				attached = false;
			}
		});
		await withTimeout(attachPromise, `Debugger attach for tab ${tabId}`);

		// Get page dimensions
		const metrics = (await withTimeout(
			chrome.debugger.sendCommand(target, "Page.getLayoutMetrics"),
			`Layout metrics for tab ${tabId}`,
		)) as {
			cssContentSize?: { width: number; height: number };
			contentSize?: { width: number; height: number };
		};

		const size = metrics.cssContentSize || metrics.contentSize;
		const width = Math.ceil(size?.width || 1280);
		const height = Math.min(Math.ceil(size?.height || 900), maxHeight);

		// Capture the current viewport without resizing — avoids visible layout reflow
		// and the "DevTools is debugging" banner is shown for a shorter duration.
		await withTimeout(
			chrome.debugger.sendCommand(target, "Page.enable"),
			`Page enable for tab ${tabId}`,
		);
		const result = (await withTimeout(
			chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
				format: "jpeg",
				quality: 50,
				clip: { x: 0, y: 0, width, height, scale: 1 },
			}),
			`Screenshot capture for tab ${tabId}`,
		)) as { data: string };

		await withTimeout(
			chrome.debugger.detach(target),
			`Debugger detach for tab ${tabId}`,
			DEBUGGER_DETACH_TIMEOUT_MS,
		);
		attached = false;
		clientDebug("stage2", "detached Chrome debugger after screenshot", { tabId });

		return result.data;
	} catch (error) {
		console.warn(`[screenshot] Failed to capture tab ${tabId}:`, error);
		clientDebug("stage2", "screenshot capture failed", {
			tabId,
			error: error instanceof Error ? error.message : String(error),
		});
		if (!attached) attachTimedOut = true;
		try {
			await withTimeout(
				chrome.debugger.detach(target),
				`Debugger detach after failure for tab ${tabId}`,
				DEBUGGER_DETACH_TIMEOUT_MS,
			);
			attached = false;
			clientDebug("stage2", "detached Chrome debugger after failure", { tabId });
		} catch {}
		return null;
	}
}

/**
 * Capture screenshots for multiple tabs.
 * Calls onProgress after each tab to report status.
 * Returns a Map of tabId → base64 JPEG.
 */
export async function captureTabScreenshots(
	tabIds: number[],
	maxHeight = 10000,
	onProgress?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
	const results = new Map<number, string>();

	for (let i = 0; i < tabIds.length; i++) {
		const tabId = tabIds[i];
		const screenshot = await captureTabScreenshot(tabId, maxHeight);
		if (screenshot) {
			results.set(tabId, screenshot);
		}
		onProgress?.(i + 1, tabIds.length);
	}

	return results;
}
