import type {
	GroupingSuggestion,
	MemoryCandidate,
	StoredTabSetSuggestion,
	TabGroupInfo,
	TabInfo,
	UngroupedTabReason,
} from "@tab-orga/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { collapseAndReorderGroups, groupTabs, updateGroup } from "../services/chromeTabsApi.js";
import { clientDebug } from "../services/clientDebug.js";
import { startContentBridge } from "../services/contentBridge.js";
import {
	clearStoredOrganizeRun,
	getStoredOrganizeRun,
	ORGANIZE_RUN_KEY,
	type OrganizeRunPhase,
	type StoredOrganizeRun,
	saveStoredOrganizeRun,
} from "../services/organizeRun.js";
import { requestBackgroundSummaryScan, type ScanProgress } from "../services/screenshotCache.js";
import { serverApi } from "../services/serverApi.js";

function mapOriginalGroups(entries: Array<[number, number]> | undefined): Map<number, number> {
	return new Map(entries || []);
}

export function useOrganize() {
	const [suggestions, setSuggestions] = useState<GroupingSuggestion[] | null>(null);
	const [reasoning, setReasoning] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [refining, setRefining] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [originalGroupIds, setOriginalGroupIds] = useState<Map<number, number>>(new Map());
	const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
	const [memoryCandidates, setMemoryCandidates] = useState<MemoryCandidate[]>([]);
	const [storeSuggestions, setStoreSuggestions] = useState<StoredTabSetSuggestion[]>([]);
	const [ungrouped, setUngrouped] = useState<UngroupedTabReason[]>([]);
	const [organizeMessage, setOrganizeMessage] = useState("");
	const [organizePhase, setOrganizePhase] = useState<OrganizeRunPhase | null>(null);
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const tabsRef = useRef<TabInfo[]>([]);
	const bridgeCleanupRef = useRef<(() => void) | null>(null);

	const applyStoredRun = useCallback((run: StoredOrganizeRun | null) => {
		if (!run) {
			setLoading(false);
			setOrganizeMessage("");
			setOrganizePhase(null);
			setActiveRunId(null);
			return;
		}

		tabsRef.current = run.tabs || [];
		setActiveRunId(run.id);
		setOriginalGroupIds(mapOriginalGroups(run.originalGroupIds));
		setLoading(run.status === "running");
		setOrganizeMessage(run.message);
		setOrganizePhase(run.phase);

		if (run.status === "running") {
			setSuggestions(null);
			setReasoning("");
			setMemoryCandidates([]);
			setStoreSuggestions([]);
			setUngrouped([]);
			setError(null);
			return;
		}

		if (run.status === "done") {
			setSuggestions(run.suggestions || []);
			setReasoning(run.reasoning || "");
			setMemoryCandidates([]);
			setStoreSuggestions(run.storeSuggestions || []);
			setUngrouped(run.ungrouped || []);
			setError(null);
			return;
		}

		if (run.status === "error") {
			setSuggestions(null);
			setReasoning("");
			setMemoryCandidates([]);
			setStoreSuggestions([]);
			setUngrouped([]);
			setError(run.error || "Failed to organize");
		}
	}, []);

	const reconcileStoredRun = useCallback(
		async (run: StoredOrganizeRun | null) => {
			if (!run) {
				applyStoredRun(null);
				return;
			}
			if (run?.status !== "running") {
				applyStoredRun(run);
				return;
			}
			try {
				const result = await serverApi.getOrganizeRun(run.id);
				if (result.run) {
					await saveStoredOrganizeRun(result.run);
					applyStoredRun(result.run);
					return;
				}
				clientDebug("organize", "clearing stale stored organize run", {
					runId: run.id,
					phase: run.phase,
					updatedAt: run.updatedAt,
				});
				await clearStoredOrganizeRun();
				applyStoredRun(null);
			} catch (error) {
				clientDebug("organize", "could not verify stored organize run; keeping it for retry", {
					runId: run.id,
					error: error instanceof Error ? error.message : String(error),
				});
				applyStoredRun(run);
			}
		},
		[applyStoredRun],
	);

	useEffect(() => {
		if (!activeRunId || !loading) return;
		let cancelled = false;
		const poll = async () => {
			try {
				const result = await serverApi.getOrganizeRun(activeRunId);
				if (cancelled) return;
				if (!result.run) {
					clientDebug("organize", "server no longer has active run; clearing local run", {
						runId: activeRunId,
					});
					await clearStoredOrganizeRun();
					applyStoredRun(null);
					return;
				}
				await saveStoredOrganizeRun(result.run);
				applyStoredRun(result.run);
			} catch (error) {
				if (cancelled) return;
				clientDebug("organize", "failed to poll server organize run", {
					runId: activeRunId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		};
		void poll();
		const intervalId = window.setInterval(() => {
			void poll();
		}, 1_500);
		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, [activeRunId, applyStoredRun, loading]);

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

	// Close bridge on unmount (e.g. side panel closed mid-organize)
	useEffect(() => {
		return () => {
			if (bridgeCleanupRef.current) {
				bridgeCleanupRef.current();
				bridgeCleanupRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		void getStoredOrganizeRun().then(reconcileStoredRun);
		if (typeof chrome === "undefined" || !chrome.storage?.local) return;
		const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (areaName !== "local" || !changes[ORGANIZE_RUN_KEY]) return;
			const nextRun = (changes[ORGANIZE_RUN_KEY].newValue as StoredOrganizeRun | undefined) || null;
			if (nextRun?.status === "running") {
				applyStoredRun(nextRun);
				return;
			}
			applyStoredRun(nextRun);
		};
		chrome.storage.onChanged.addListener(onChanged);
		return () => {
			chrome.storage.onChanged.removeListener(onChanged);
		};
	}, [applyStoredRun, reconcileStoredRun]);

	const organize = useCallback(
		async (tabs: TabInfo[], groups: TabGroupInfo[], instruction = "") => {
			setLoading(true);
			setError(null);
			setSuggestions(null);
			setReasoning("");
			setMemoryCandidates([]);
			setStoreSuggestions([]);
			setUngrouped([]);
			setOrganizeMessage("Queued organize run");
			setOrganizePhase("queued");
			clientDebug("organize", "button clicked", {
				tabs: tabs.length,
				groups: groups.length,
				instruction: instruction.trim() || undefined,
			});

			// Start content bridge so AI can request full page content while the panel is open.
			ensureBridge();
			void requestBackgroundSummaryScan("stage1", "fast");

			try {
				setScanProgress(null);
				tabsRef.current = tabs;

				const origMap = new Map<number, number>();
				for (const tab of tabs) {
					origMap.set(tab.id, tab.groupId);
				}
				setOriginalGroupIds(origMap);

				const result = await serverApi.startOrganizeRun({
					tabs,
					existingGroups: groups,
					instruction: instruction.trim() || undefined,
				});
				clientDebug("organize", "server organize run started", { runId: result.run.id });
				await saveStoredOrganizeRun(result.run);
				applyStoredRun(result.run);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to organize";
				setError(message);
				setLoading(false);
				setOrganizeMessage("Organize failed");
				setOrganizePhase("error");
			}
		},
		[applyStoredRun, ensureBridge],
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
				setMemoryCandidates(result.memoryCandidates || []);
				setStoreSuggestions(result.storeSuggestions || []);
				setUngrouped(result.ungrouped || []);
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
						try {
							gid = await groupTabs(suggestion.tabIds, suggestion.existingGroupId);
						} catch (e) {
							console.warn(
								`[apply] Existing group ${suggestion.existingGroupId} unavailable for "${suggestion.groupName}", creating a new group`,
								e,
							);
							gid = await groupTabs(suggestion.tabIds);
						}
					} else {
						gid = await groupTabs(suggestion.tabIds);
					}

					// Set title + color in one call (colors are validated server-side)
					const logMsg = `Group "${suggestion.groupName}" gid=${gid} color="${suggestion.color}"`;
					console.log(`[apply] ${logMsg}`);
					try {
						await updateGroup(gid, {
							title: suggestion.groupName,
							color: suggestion.color,
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
				setMemoryCandidates([]);
				setStoreSuggestions([]);
				setUngrouped([]);
				setLoading(false);
				setOrganizeMessage("");
				setOrganizePhase(null);
				void clearStoredOrganizeRun();
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
		setMemoryCandidates([]);
		setStoreSuggestions([]);
		setUngrouped([]);
		setLoading(false);
		setOrganizeMessage("");
		setOrganizePhase(null);
		void clearStoredOrganizeRun();
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
		memoryCandidates,
		storeSuggestions,
		ungrouped,
		organizeMessage,
		organizePhase,
		organize,
		refine,
		applySuggestions,
		dismiss,
	};
}
