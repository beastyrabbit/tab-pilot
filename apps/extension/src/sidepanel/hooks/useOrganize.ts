import type {
	GroupingSuggestion,
	MemoryCandidate,
	StoredTabSetSuggestion,
	TabGroupInfo,
	TabInfo,
} from "@tab-orga/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractTabContent } from "../services/chromeContentApi.js";
import {
	closeTabs,
	collapseAndReorderGroups,
	groupTabs,
	ungroupTabs,
	updateGroup,
} from "../services/chromeTabsApi.js";
import { clientDebug } from "../services/clientDebug.js";
import { startContentBridge } from "../services/contentBridge.js";
import { resolveFixedGroupIds, setFixedGroup, syncFixedGroupIds } from "../services/fixedGroups.js";
import {
	clearStoredOrganizeRun,
	getStoredOrganizeRun,
	ORGANIZE_RUN_KEY,
	type OrganizeRunPhase,
	type StoredOrganizeRun,
	saveStoredOrganizeRun,
} from "../services/organizeRun.js";
import { loadOrganizerPreferences, organizeViaProxy, refineViaProxy } from "../services/proxyAi.js";
import {
	logSettings,
	type OrganizeRunLog,
	recordOutcome,
	recordProposal,
	saveRunLog,
	snapshotGroups,
	snapshotTabs,
} from "../services/runHistory.js";
import type { ScanProgress } from "../services/screenshotCache.js";
import { loadSettings } from "./useSettings.js";

function mapOriginalGroups(entries: Array<[number, number]> | undefined): Map<number, number> {
	return new Map(entries || []);
}

function titleNeedsContext(tab: TabInfo): boolean {
	const title = tab.title.trim();
	const host = (() => {
		try {
			return new URL(tab.url).hostname.replace(/^www\./, "");
		} catch {
			return "";
		}
	})();
	const genericTitle = !title || /^(new tab|home|welcome|untitled|loading|dashboard)$/i.test(title);
	return genericTitle || title.length < 12 || title.toLowerCase() === host;
}

const MAX_DEEP_READS = 24;

async function prepareTabContext(tabs: TabInfo[]): Promise<TabInfo[]> {
	// Scripts cannot run in non-web pages or in tabs Chrome has not loaded since a restore.
	const live = await chrome.tabs.query({}).catch(() => [] as chrome.tabs.Tab[]);
	const unloaded = new Set(
		live.filter((tab) => tab.discarded || String(tab.status) === "unloaded").map((tab) => tab.id),
	);
	const queue = tabs.filter((tab) => /^https?:/.test(tab.url) && !unloaded.has(tab.id));
	const context = new Map<number, TabInfo>();
	let deepReads = 0;
	const worker = async () => {
		while (queue.length) {
			const tab = queue.shift();
			if (!tab) return;
			// An ambiguous title gets one full read, which also returns the metadata.
			const fullRead = titleNeedsContext(tab) && deepReads < MAX_DEEP_READS;
			if (fullRead) deepReads += 1;
			let content = await extractTabContent(tab.id, fullRead);
			if (
				content &&
				!fullRead &&
				!content.metaDescription &&
				!content.ogDescription &&
				deepReads < MAX_DEEP_READS
			) {
				deepReads += 1;
				content = (await extractTabContent(tab.id, true)) ?? content;
			}
			if (!content) continue;
			context.set(tab.id, {
				...tab,
				metaDescription: content.metaDescription || content.ogDescription || undefined,
				pageText: content.pageText?.slice(0, 1800) || undefined,
			});
		}
	};
	await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
	return tabs.map((tab) => context.get(tab.id) ?? tab);
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
	const [organizeMessage, setOrganizeMessage] = useState("");
	const [organizePhase, setOrganizePhase] = useState<OrganizeRunPhase | null>(null);
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const tabsRef = useRef<TabInfo[]>([]);
	const groupsRef = useRef<TabGroupInfo[]>([]);
	const runLogRef = useRef<OrganizeRunLog | null>(null);
	const persistLog = useCallback(async (log: OrganizeRunLog) => {
		try {
			await saveRunLog(log);
		} catch {
			setError("Run history could not be saved. Browser storage may be full.");
		}
	}, []);
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
			setError(null);
			return;
		}

		if (run.status === "done") {
			setSuggestions(run.suggestions || []);
			setReasoning(run.reasoning || "");
			setMemoryCandidates([]);
			setStoreSuggestions(run.storeSuggestions || []);
			setError(null);
			return;
		}

		if (run.status === "error") {
			setSuggestions(null);
			setReasoning("");
			setMemoryCandidates([]);
			setStoreSuggestions([]);
			setError(run.error || "Failed to organize");
		}
	}, []);

	const reconcileStoredRun = useCallback(
		async (run: StoredOrganizeRun | null) => {
			applyStoredRun(run);
		},
		[applyStoredRun],
	);

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
			const runLog: OrganizeRunLog = {
				id: crypto.randomUUID(),
				version: 2,
				startedAt: new Date().toISOString(),
				status: "running",
				phase: "context",
				tabCount: tabs.length,
				groupCount: groups.length,
			};
			runLogRef.current = runLog;
			void persistLog(runLog);
			setLoading(true);
			setError(null);
			setSuggestions(null);
			setReasoning("");
			setMemoryCandidates([]);
			setStoreSuggestions([]);
			setOrganizeMessage("Queued organize run");
			setOrganizePhase("queued");
			clientDebug("organize", "button clicked", {
				tabs: tabs.length,
				groups: groups.length,
				instruction: instruction.trim() || undefined,
			});

			// Start content bridge so AI can request full page content while the panel is open.
			ensureBridge();

			try {
				setScanProgress(null);
				tabsRef.current = tabs;

				const origMap = new Map<number, number>();
				for (const tab of tabs) {
					origMap.set(tab.id, tab.groupId);
				}
				setOriginalGroupIds(origMap);

				const settings = await loadSettings();
				runLog.settings = logSettings(settings);
				groupsRef.current = groups;
				const fixedGroups = await syncFixedGroupIds(groups);
				const resolvedIds = await resolveFixedGroupIds(groups);
				runLog.tabs = snapshotTabs(tabs, settings.proxyApiKey);
				runLog.groups = snapshotGroups(groups, resolvedIds, settings.proxyApiKey);
				await persistLog(runLog);
				const contextTabs = await prepareTabContext(tabs);
				tabsRef.current = contextTabs;
				runLog.tabs = snapshotTabs(contextTabs, settings.proxyApiKey);
				runLog.groups = snapshotGroups(groups, resolvedIds, settings.proxyApiKey);
				runLog.deepContextCount = contextTabs.filter((tab) => Boolean(tab.pageText)).length;
				runLog.fixedGroupNames = runLog.groups
					.filter((group) => group.fixed)
					.map((group) => group.name);
				runLog.phase = "model";
				await persistLog(runLog);
				const result = await organizeViaProxy(
					settings,
					contextTabs,
					groups,
					instruction.trim(),
					fixedGroups,
					await loadOrganizerPreferences(),
				);
				setSuggestions(result.suggestions);
				setReasoning(result.reasoning);
				setStoreSuggestions(result.storeSuggestions);
				recordProposal(runLog, result.suggestions, "initial", settings.proxyApiKey);
				runLog.status = "proposal";
				runLog.phase = "proposal";
				runLog.finishedAt = new Date().toISOString();
				await persistLog(runLog);
				setLoading(false);
				setOrganizeMessage("Proposal ready");
				setOrganizePhase("done");
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to organize";
				setError(message);
				setLoading(false);
				setOrganizeMessage("Organize failed");
				setOrganizePhase("error");
				runLog.status = "error";
				runLog.error = `Organization failed during ${runLog.phase || "processing"}.`;
				runLog.finishedAt = new Date().toISOString();
				await persistLog(runLog);
			}
		},
		[ensureBridge, persistLog],
	);

	const refine = useCallback(
		async (feedback: string, targetGroupName?: string, targetTabId?: number) => {
			if (!suggestions) return;
			const runLog = runLogRef.current;
			setRefining(true);
			setError(null);

			// Ensure bridge is up for refine too (AI might need more content)
			ensureBridge();

			try {
				if (runLog) {
					runLog.phase = "refine";
					await persistLog(runLog);
				}
				const settings = await loadSettings();
				const groups = groupsRef.current;
				const result = await refineViaProxy(
					settings,
					suggestions,
					tabsRef.current,
					feedback,
					groups,
					await syncFixedGroupIds(groups),
					await loadOrganizerPreferences(),
					{ groupName: targetGroupName, tabId: targetTabId },
				);
				if (runLog) {
					recordProposal(runLog, result.suggestions, "refinement", settings.proxyApiKey);
					runLog.status = "proposal";
					runLog.phase = "proposal";
					runLog.error = undefined;
					await persistLog(runLog);
				}
				setSuggestions(result.suggestions);
				setReasoning(result.reasoning);
				setMemoryCandidates(result.memoryCandidates || []);
				setStoreSuggestions(result.storeSuggestions || []);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to refine");
				if (runLog) {
					runLog.error = "Refinement failed; the previous proposal remains available.";
					await persistLog(runLog);
				}
			} finally {
				setRefining(false);
			}
		},
		[suggestions, ensureBridge, persistLog],
	);

	const applySuggestions = useCallback(
		async (toApply: GroupingSuggestion[]) => {
			const runLog = runLogRef.current;
			const expected = new Map<number, number>();
			const closedDuplicateIds: number[] = [];
			let logSecret = "";
			const captureOutcome = async () => {
				if (!runLog) return;
				try {
					const [tabs, groups] = await Promise.all([
						chrome.tabs.query({}),
						chrome.tabGroups.query({}),
					]);
					recordOutcome(
						runLog,
						tabs,
						groups.filter((group) =>
							tabs.some(
								(tab) =>
									tab.groupId === group.id &&
									runLog.tabs?.some((original) => original.windowId === tab.windowId),
							),
						),
						expected,
						closedDuplicateIds,
						logSecret,
					);
				} catch {
					runLog.error = "Could not read browser state to verify the apply result.";
				}
			};
			try {
				const organizeSettings = await loadSettings();
				logSecret = organizeSettings.proxyApiKey || "";
				if (runLog) {
					recordProposal(runLog, toApply, "apply-selection", logSecret);
					runLog.phase = "apply";
					runLog.error = undefined;
					await persistLog(runLog);
				}
				// Tabs can close while the proposal is on screen; never touch ids that are gone.
				const liveTabs = await chrome.tabs.query({});
				const liveTabIds = new Set(liveTabs.map((tab) => tab.id));
				const lastAccessed = new Map(liveTabs.map((tab) => [tab.id, tab.lastAccessed ?? 0]));
				const currentTabs = tabsRef.current.filter((tab) => liveTabIds.has(tab.id));
				const fixedGroupsForApply = await syncFixedGroupIds(
					await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
				);
				const fixedIds = new Set(fixedGroupsForApply.map((group) => group.id));
				if (!organizeSettings.preserveExistingGroups) {
					const resetIds = currentTabs
						.filter((tab) => tab.groupId >= 0 && !fixedIds.has(tab.groupId))
						.map((tab) => tab.id);
					if (resetIds.length) await ungroupTabs(resetIds);
				}
				// 1. Create/update suggested groups
				for (const proposed of toApply) {
					const suggestion = {
						...proposed,
						tabIds: proposed.tabIds.filter((id) => liveTabIds.has(id)),
					};
					if (suggestion.tabIds.length === 0) continue;
					if (suggestion.existingGroupId != null && fixedIds.has(suggestion.existingGroupId)) {
						console.log(`[apply] Preserving fixed group ${suggestion.existingGroupId}`);
						let fixedGid = suggestion.existingGroupId;
						try {
							await groupTabs(suggestion.tabIds, fixedGid);
						} catch (e) {
							// Chrome deletes a group once its last tab leaves; recreate it and keep it fixed.
							console.warn(
								`[apply] Fixed group ${fixedGid} is gone, recreating "${suggestion.groupName}"`,
								e,
							);
							const goneGid = fixedGid;
							fixedGid = await groupTabs(suggestion.tabIds);
							await updateGroup(fixedGid, { title: suggestion.groupName, color: suggestion.color });
							const liveGroupIds = (await chrome.tabGroups.query({})).map((group) => group.id);
							await setFixedGroup(
								{ id: goneGid, title: suggestion.groupName, color: suggestion.color },
								false,
								liveGroupIds,
							);
							await setFixedGroup(
								{ id: fixedGid, title: suggestion.groupName, color: suggestion.color },
								true,
							);
						}
						for (const id of suggestion.tabIds) expected.set(id, fixedGid);
						continue;
					}

					let gid: number;
					// "Do not add to existing groups" still lets a group keep its own current tabs.
					const onlyCurrentMembers = suggestion.tabIds.every(
						(id) =>
							currentTabs.find((tab) => tab.id === id)?.groupId === suggestion.existingGroupId,
					);
					if (
						suggestion.existingGroupId != null &&
						(organizeSettings.allowAddToExistingGroups || onlyCurrentMembers)
					) {
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
					for (const id of suggestion.tabIds) expected.set(id, gid);

					// Set title + color in one call (colors are validated in proxyAi.ts). A freshly
					// created group always needs its title; "no renames" only protects reused groups.
					const freshGroup = gid !== suggestion.existingGroupId;
					const setTitle = freshGroup || organizeSettings.allowRenameGroups;
					const logMsg = `Group "${suggestion.groupName}" gid=${gid} color="${suggestion.color}"`;
					console.log(`[apply] ${logMsg}`);
					try {
						await updateGroup(gid, {
							...(setTitle ? { title: suggestion.groupName } : {}),
							color: suggestion.color,
						});
						console.log(`[apply] updateGroup OK for "${suggestion.groupName}"`);
					} catch (e) {
						const err = e instanceof Error ? e.message : String(e);
						console.log(`[apply] updateGroup FAILED for "${suggestion.groupName}": ${err}`);
						// Fallback: try title-only
						try {
							if (setTitle) await updateGroup(gid, { title: suggestion.groupName });
						} catch {}
					}

					// Verify the color was actually set
					try {
						const check = await chrome.tabGroups.get(gid);
						console.log(`[apply] Verify gid=${gid}: title="${check.title}" color="${check.color}"`);
					} catch {}
				}
				if (organizeSettings.groupingMode === "hard") {
					const assigned = new Set(toApply.flatMap((suggestion) => suggestion.tabIds));
					const remaining = currentTabs
						.filter((tab) => !assigned.has(tab.id) && tab.groupId === -1)
						.map((tab) => tab.id);
					if (remaining.length) {
						const gid = await groupTabs(remaining);
						for (const id of remaining) expected.set(id, gid);
						await updateGroup(gid, { title: "Other", color: "grey" });
					}
				}
				const duplicateSettings = organizeSettings;
				if (duplicateSettings.closeDuplicateTabs) {
					const byUrl = new Map<string, TabInfo[]>();
					for (const tab of currentTabs) {
						const key = tab.url.trim();
						byUrl.set(key, [...(byUrl.get(key) ?? []), tab]);
					}
					const duplicateIds = [...byUrl.values()]
						.filter((items) => items.length > 1)
						.flatMap((items) =>
							// Oldest first by last use, so "keep newest" keeps the most recently used copy.
							[...items]
								.sort((a, b) => (lastAccessed.get(a.id) ?? 0) - (lastAccessed.get(b.id) ?? 0))
								.slice(
									duplicateSettings.keepNewestDuplicate ? 0 : 1,
									duplicateSettings.keepNewestDuplicate ? -1 : undefined,
								)
								.map((tab) => tab.id),
						);
					if (duplicateIds.length) {
						await closeTabs(duplicateIds);
						closedDuplicateIds.push(...duplicateIds);
					}
				}

				// 2. Collapse ALL groups and move them to the left
				await collapseAndReorderGroups();

				setSuggestions(null);
				setReasoning("");
				setMemoryCandidates([]);
				setStoreSuggestions([]);
				setLoading(false);
				setOrganizeMessage("");
				setOrganizePhase(null);
				await captureOutcome();
				if (runLog) {
					runLog.status = "applied";
					runLog.appliedAt = new Date().toISOString();
					await persistLog(runLog);
				}
				void clearStoredOrganizeRun();
				closeBridge();
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to apply groups");
				await captureOutcome();
				if (runLog) {
					runLog.status = "error";
					runLog.error = "Apply failed. Some tabs may already have moved; see the observed state.";
					await persistLog(runLog);
				}
			}
		},
		[closeBridge, persistLog],
	);

	const dismiss = useCallback(() => {
		setSuggestions(null);
		setReasoning("");
		setMemoryCandidates([]);
		setStoreSuggestions([]);
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
		organizeMessage,
		organizePhase,
		organize,
		refine,
		applySuggestions,
		dismiss,
	};
}
