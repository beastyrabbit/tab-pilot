const isChromeExtension = typeof chrome !== "undefined" && !!chrome.tabs;

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

	try {
		await chrome.debugger.attach({ tabId }, "1.3");

		// Get page dimensions
		const metrics = (await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics")) as {
			cssContentSize?: { width: number; height: number };
			contentSize?: { width: number; height: number };
		};

		const size = metrics.cssContentSize || metrics.contentSize;
		const width = Math.ceil(size?.width || 1280);
		const height = Math.min(Math.ceil(size?.height || 900), maxHeight);

		// Capture the current viewport without resizing — avoids visible layout reflow
		// and the "DevTools is debugging" banner is shown for a shorter duration.
		const result = (await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
			format: "jpeg",
			quality: 50,
			clip: { x: 0, y: 0, width, height, scale: 1 },
		})) as { data: string };

		await chrome.debugger.detach({ tabId });

		return result.data;
	} catch {
		try {
			await chrome.debugger.detach({ tabId });
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
