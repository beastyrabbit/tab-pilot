import type { ContentDepth, GroupingSuggestion, TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useCallback, useRef, useState } from "react";
import { enrichTabsWithContent } from "../services/chromeContentApi.js";
import { collapseAndReorderGroups, groupTabs, updateGroup } from "../services/chromeTabsApi.js";
import { startContentBridge } from "../services/contentBridge.js";
import {
	type ScanProgress,
	getTabsNeedingScreenshots,
	runScreenshotScan,
} from "../services/screenshotCache.js";
import { serverApi } from "../services/serverApi.js";

export function useOrganize() {
	const [suggestions, setSuggestions] = useState<GroupingSuggestion[] | null>(null);
	const [reasoning, setReasoning] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [refining, setRefining] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [originalGroupIds, setOriginalGroupIds] = useState<Map<number, number>>(new Map());
	const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
	const tabsRef = useRef<TabInfo[]>([]);
	const bridgeCleanupRef = useRef<(() => void) | null>(null);
	const scanRunningRef = useRef(false);

	const ensureBridge = useCallback(() => {
		if (!bridgeCleanupRef.current) {
			bridgeCleanupRef.current = startContentBridge();
		}
	}, []);

	const closeBridge = useCallback(() => {
		if (bridgeCleanupRef.current) {
			bridgeCleanupRef.current();
			bridgeCleanupRef.current = null;
		}
	}, []);

	const organize = useCallback(
		async (tabs: TabInfo[], groups: TabGroupInfo[], contentDepth: ContentDepth = "title-url") => {
			setLoading(true);
			setError(null);

			// Start content bridge so AI can request full page content
			ensureBridge();

			// Fire screenshot scan independently — runs in background,
			// doesn't block organize, caches results for search.
			// getTabsNeedingScreenshots checks the cache and skips
			// tabs that already have a fresh summary.
			if (!scanRunningRef.current) {
				scanRunningRef.current = true;
				getTabsNeedingScreenshots(tabs).then((needed) => {
					if (needed.length === 0) {
						console.log("[organize] All tabs already cached, skipping scan");
						scanRunningRef.current = false;
						return;
					}
					runScreenshotScan(tabs, (progress) => {
						setScanProgress(progress);
						if (progress.phase === "done") {
							scanRunningRef.current = false;
							setTimeout(() => setScanProgress(null), 2000);
						}
					}).catch(() => {
						scanRunningRef.current = false;
						setScanProgress(null);
					});
				});
			}

			try {
				const enrichedTabs = await enrichTabsWithContent(tabs, contentDepth);
				tabsRef.current = enrichedTabs;

				// Record original group for each tab (for LED status)
				const origMap = new Map<number, number>();
				for (const tab of tabs) {
					origMap.set(tab.id, tab.groupId);
				}
				setOriginalGroupIds(origMap);

				const result = await serverApi.organize({
					tabs: enrichedTabs,
					existingGroups: groups,
					contentDepth,
				});
				setSuggestions(result.suggestions);
				setReasoning(result.reasoning);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to organize");
			} finally {
				setLoading(false);
			}
		},
		[ensureBridge],
	);

	const refine = useCallback(
		async (feedback: string, targetGroupName?: string, targetTabId?: number) => {
			if (!suggestions) return;
			setRefining(true);
			setError(null);

			// Ensure bridge is up for refine too (AI might need more content)
			ensureBridge();

			try {
				const result = await serverApi.refine({
					suggestions,
					tabs: tabsRef.current,
					feedback,
					targetGroupName,
					targetTabId,
				});
				setSuggestions(result.suggestions);
				setReasoning(result.reasoning);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to refine");
			} finally {
				setRefining(false);
			}
		},
		[suggestions, ensureBridge],
	);

	const applySuggestions = useCallback(
		async (toApply: GroupingSuggestion[]) => {
			try {
				// 1. Create/update suggested groups
				for (const suggestion of toApply) {
					if (suggestion.tabIds.length === 0) continue;

					let gid: number;
					if (suggestion.existingGroupId != null) {
						gid = await groupTabs(suggestion.tabIds, suggestion.existingGroupId);
					} else {
						gid = await groupTabs(suggestion.tabIds);
					}

					// Set title + color in one call (colors are validated server-side)
					const logMsg = `Group "${suggestion.groupName}" gid=${gid} color="${suggestion.color}"`;
					console.log(`[apply] ${logMsg}`);
					try {
						await updateGroup(gid, {
							title: suggestion.groupName,
							color: suggestion.color as chrome.tabGroups.ColorEnum,
						});
						console.log(`[apply] updateGroup OK for "${suggestion.groupName}"`);
					} catch (e) {
						const err = e instanceof Error ? e.message : String(e);
						console.log(`[apply] updateGroup FAILED for "${suggestion.groupName}": ${err}`);
						// Fallback: try title-only
						try {
							await updateGroup(gid, { title: suggestion.groupName });
						} catch {}
					}

					// Verify the color was actually set
					try {
						const check = await chrome.tabGroups.get(gid);
						console.log(`[apply] Verify gid=${gid}: title="${check.title}" color="${check.color}"`);
					} catch {}
				}

				// 2. Collapse ALL groups and move them to the left
				await collapseAndReorderGroups();

				setSuggestions(null);
				setReasoning("");
				closeBridge();
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to apply groups");
			}
		},
		[closeBridge],
	);

	const dismiss = useCallback(() => {
		setSuggestions(null);
		setReasoning("");
		closeBridge();
	}, [closeBridge]);

	return {
		suggestions,
		reasoning,
		loading,
		refining,
		error,
		originalGroupIds,
		scanProgress,
		organize,
		refine,
		applySuggestions,
		dismiss,
	};
}
