import type {
	GroupingSuggestion,
	MemoryCandidate,
	PublicSettings,
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
import { pickDuplicateTabsToClose } from "../services/duplicates.js";
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

/** Browser state and settings shared by the apply steps. */
interface ApplyContext {
	settings: PublicSettings;
	/** Tabs from the proposal that still exist, with their pre-apply group ids. */
	currentTabs: TabInfo[];
	/** Fixed group ids; a recreated fixed group's new id is added. */
	fixedIds: Set<number>;
	/** Where each tab should end up, for the run-history outcome check. */
	expected: Map<number, number>;
}

/** Re-attach tabs to a fixed group, or recreate it (and keep it fixed) if Chrome deleted it. */
async function applyFixedSuggestion(
	suggestion: GroupingSuggestion,
	groupId: number,
	ctx: ApplyContext,
): Promise<void> {
	console.log(`[apply] Preserving fixed group ${groupId}`);
	let fixedGid = groupId;
	try {
		await groupTabs(suggestion.tabIds, fixedGid);
	} catch (e) {
		// Chrome deletes a group once its last tab leaves; recreate it and keep it fixed.
		console.warn(
			`[apply] Fixed group ${fixedGid} is gone, recreating "${suggestion.groupName}"`,
			e,
		);
		fixedGid = await groupTabs(suggestion.tabIds);
		await updateGroup(fixedGid, { title: suggestion.groupName, color: suggestion.color });
		const group = { title: suggestion.groupName, color: suggestion.color };
		await setFixedGroup({ id: groupId, ...group }, false);
		await setFixedGroup({ id: fixedGid, ...group }, true);
		ctx.fixedIds.add(fixedGid);
	}
	for (const id of suggestion.tabIds) ctx.expected.set(id, fixedGid);
}

/** Put tabs into the suggested existing group when allowed, otherwise into a new group. */
async function placeSuggestion(suggestion: GroupingSuggestion, ctx: ApplyContext): Promise<number> {
	const existingId = suggestion.existingGroupId;
	if (existingId == null) return groupTabs(suggestion.tabIds);
	// "Do not add to existing groups" still lets a group keep its own current tabs.
	const onlyCurrentMembers = suggestion.tabIds.every(
		(id) => ctx.currentTabs.find((tab) => tab.id === id)?.groupId === existingId,
	);
	if (!ctx.settings.allowAddToExistingGroups && !onlyCurrentMembers) {
		return groupTabs(suggestion.tabIds);
	}
	try {
		return await groupTabs(suggestion.tabIds, existingId);
	} catch (e) {
		console.warn(
			`[apply] Existing group ${existingId} unavailable for "${suggestion.groupName}", creating a new group`,
			e,
		);
		return groupTabs(suggestion.tabIds);
	}
}

async function applyGroupSuggestion(
	suggestion: GroupingSuggestion,
	ctx: ApplyContext,
): Promise<void> {
	const gid = await placeSuggestion(suggestion, ctx);
	for (const id of suggestion.tabIds) ctx.expected.set(id, gid);
	// Colors are validated in proxyAi.ts. A freshly created group always needs its
	// title; "no renames" only protects reused groups.
	const setTitle = gid !== suggestion.existingGroupId || ctx.settings.allowRenameGroups;
	console.log(`[apply] Group "${suggestion.groupName}" gid=${gid} color="${suggestion.color}"`);
	try {
		await updateGroup(gid, {
			...(setTitle ? { title: suggestion.groupName } : {}),
			color: suggestion.color,
		});
	} catch (e) {
		console.log(`[apply] updateGroup FAILED for "${suggestion.groupName}": ${String(e)}`);
		// Fallback: try title-only
		if (setTitle) await updateGroup(gid, { title: suggestion.groupName }).catch(() => {});
	}
}

/** Hard mode: tabs the proposal left ungrouped go into one "Other" group. */
async function groupRemainingTabs(toApply: GroupingSuggestion[], ctx: ApplyContext): Promise<void> {
	const assigned = new Set(toApply.flatMap((suggestion) => suggestion.tabIds));
	const remaining = ctx.currentTabs
		.filter((tab) => !assigned.has(tab.id) && tab.groupId === -1)
		.map((tab) => tab.id);
	if (!remaining.length) return;
	const gid = await groupTabs(remaining);
	for (const id of remaining) ctx.expected.set(id, gid);
	await updateGroup(gid, { title: "Other", color: "grey" });
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
				const fixedGroups = await syncFixedGroupIds();
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
				const result = await refineViaProxy(settings, suggestions, tabsRef.current, feedback, {
					groups,
					fixedGroups: await syncFixedGroupIds(),
					preferences: await loadOrganizerPreferences(),
					target: { groupName: targetGroupName, tabId: targetTabId },
				});
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
				const lastAccessed = new Map<number, number>();
				for (const tab of liveTabs) {
					if (tab.id !== undefined) lastAccessed.set(tab.id, tab.lastAccessed ?? 0);
				}
				const currentTabs = tabsRef.current.filter((tab) => liveTabIds.has(tab.id));
				const fixedGroupsForApply = await syncFixedGroupIds();
				const fixedIds = new Set(fixedGroupsForApply.map((group) => group.id));
				if (!organizeSettings.preserveExistingGroups) {
					const resetIds = currentTabs
						.filter((tab) => tab.groupId >= 0 && !fixedIds.has(tab.groupId))
						.map((tab) => tab.id);
					if (resetIds.length) await ungroupTabs(resetIds);
				}
				// 1. Create/update suggested groups
				const ctx: ApplyContext = { settings: organizeSettings, currentTabs, fixedIds, expected };
				for (const proposed of toApply) {
					const suggestion = {
						...proposed,
						tabIds: proposed.tabIds.filter((id) => liveTabIds.has(id)),
					};
					if (suggestion.tabIds.length === 0) continue;
					const existingId = suggestion.existingGroupId;
					if (existingId != null && fixedIds.has(existingId)) {
						await applyFixedSuggestion(suggestion, existingId, ctx);
					} else {
						await applyGroupSuggestion(suggestion, ctx);
					}
				}
				if (organizeSettings.groupingMode === "hard") await groupRemainingTabs(toApply, ctx);
				if (organizeSettings.closeDuplicateTabs) {
					// A tab ends in a fixed group if apply put it there or it was already in one.
					const liveGroupOf = new Map(liveTabs.map((tab) => [tab.id, tab.groupId]));
					const inFixedGroup = (id: number) =>
						fixedIds.has(expected.get(id) ?? liveGroupOf.get(id) ?? -1);
					const duplicateIds = pickDuplicateTabsToClose(
						currentTabs,
						lastAccessed,
						organizeSettings.keepNewestDuplicate,
						inFixedGroup,
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
