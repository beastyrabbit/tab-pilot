import type {
	StoredTabInput,
	StoredTabSetSuggestion,
	TabGroupInfo,
	TabInfo,
} from "@tab-orga/shared";
import { useEffect, useState } from "react";
import { MemoryManager } from "./components/MemoryManager.js";
import { OrganizeButton } from "./components/OrganizeButton.js";
import { ProposalView } from "./components/ProposalView.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { StoredSetsManager } from "./components/StoredSetsManager.js";
import { TabList } from "./components/TabList.js";
import { useMemory } from "./hooks/useMemory.js";
import { useOrganize } from "./hooks/useOrganize.js";
import { type ServerStatus, useServerHealth } from "./hooks/useServerHealth.js";
import { useSettings } from "./hooks/useSettings.js";
import { useTabs } from "./hooks/useTabs.js";
import { useTestMode } from "./hooks/useTestMode.js";
import { extractTabContent } from "./services/chromeContentApi.js";
import {
	closeTabs,
	collapseAndReorderGroups,
	moveTabToGroup,
	ungroupTabs,
	updateGroup,
} from "./services/chromeTabsApi.js";
import type { ScanProgress } from "./services/screenshotCache.js";
import { type SummaryAvailability, serverApi } from "./services/serverApi.js";

type Panel = "settings" | "memory" | "stored" | null;

function isStorableUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

async function buildStoredTabInputs(
	tabs: TabInfo[],
	availability: Record<string, SummaryAvailability>,
): Promise<StoredTabInput[]> {
	const restorableTabs = tabs.filter((tab) => isStorableUrl(tab.url));
	const metadata = await Promise.all(
		restorableTabs.map(async (tab) => extractTabContent(tab.id, false)),
	);
	return restorableTabs.map((tab, index) => {
		const summary = availability[tab.url];
		const tabMetadata = metadata[index];
		const metaDescription =
			tab.metaDescription ||
			tabMetadata?.metaDescription ||
			tabMetadata?.ogDescription ||
			undefined;
		return {
			originalUrl: tab.url,
			title: tab.title,
			favIconUrl: tab.favIconUrl,
			metadata:
				metaDescription || tabMetadata?.ogDescription || tabMetadata?.keywords
					? {
							metaDescription,
							ogDescription: tabMetadata?.ogDescription || undefined,
							keywords: tabMetadata?.keywords || undefined,
						}
					: undefined,
			stage1Summary: summary?.stage1Summary,
			stage2Summary: summary?.stage2Summary,
		};
	});
}

function AppHeader({
	organizing,
	organizeMessage,
	organizeDisabled,
	confirmUngroupAll,
	ungroupAllDisabled,
	status,
	testMode,
	onOrganize,
	onUngroupAll,
	onOpenMemory,
	onOpenStored,
	onOpenSettings,
}: {
	organizing: boolean;
	organizeMessage: string;
	organizeDisabled: boolean;
	confirmUngroupAll: boolean;
	ungroupAllDisabled: boolean;
	status: ServerStatus;
	testMode: boolean;
	onOrganize: () => void;
	onUngroupAll: () => void;
	onOpenMemory: () => void;
	onOpenStored: () => void;
	onOpenSettings: () => void;
}) {
	return (
		<div className="flex items-center gap-2 mb-3">
			<OrganizeButton
				onClick={onOrganize}
				loading={organizing}
				status={organizeMessage}
				disabled={organizeDisabled}
			/>
			<button
				type="button"
				onClick={onUngroupAll}
				disabled={ungroupAllDisabled}
				className={`flex items-center gap-1.5 py-1.5 px-2.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
					confirmUngroupAll
						? "text-white bg-red-600 hover:bg-red-700"
						: "text-gray-600 bg-gray-200 hover:bg-gray-300 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
				}`}
				title={confirmUngroupAll ? "Confirm ungroup all" : "Ungroup all"}
			>
				<svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M8 7h8M8 12h8M8 17h8M4 7h.01M4 12h.01M4 17h.01"
					/>
				</svg>
				{confirmUngroupAll ? "Confirm" : "Ungroup all"}
			</button>
			<div className="flex items-center gap-1 flex-shrink-0">
				<span
					className={`size-2 rounded-full ${
						status === "online"
							? "bg-green-500"
							: status === "offline"
								? "bg-red-500"
								: "bg-yellow-500"
					}`}
					title={status === "checking" ? "..." : status}
				/>
				{testMode && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
						test
					</span>
				)}
				<button
					type="button"
					aria-label="Memories"
					onClick={onOpenMemory}
					className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
					title="Memories"
				>
					<svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
						/>
					</svg>
				</button>
				<button
					type="button"
					aria-label="Stored sets"
					onClick={onOpenStored}
					className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
					title="Stored sets"
				>
					<svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 5h14v14l-7-4-7 4V5z"
						/>
					</svg>
				</button>
				<button
					type="button"
					aria-label="Settings"
					onClick={onOpenSettings}
					className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
					title="Settings"
				>
					<svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}

function StatusBanners({
	status,
	codexConnected,
	error,
}: {
	status: ServerStatus;
	codexConnected: boolean;
	error: string | null;
}) {
	return (
		<>
			{status === "offline" && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-red-700 text-xs dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					Server offline. Run <code className="font-mono">pnpm dev:server</code>
				</div>
			)}
			{status === "online" && !codexConnected && (
				<div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-amber-700 text-xs dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400">
					Pi Codex auth missing. Run <code className="font-mono">pnpm pi:login</code>
				</div>
			)}
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-red-700 text-xs dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					{error}
				</div>
			)}
		</>
	);
}

function ScanProgressNotice({ scanProgress }: { scanProgress: ScanProgress | null }) {
	if (!scanProgress || scanProgress.phase === "done") return null;
	return (
		<div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 mb-2">
			<span className="size-2.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
			{scanProgress.phase === "capturing"
				? `Scanning tabs ${scanProgress.done}/${scanProgress.total}`
				: `AI summarizing ${scanProgress.done}/${scanProgress.total}`}
		</div>
	);
}

function InstructionForm({
	inProposalMode,
	instruction,
	disabled,
	onInstructionChange,
	onSubmit,
}: {
	inProposalMode: boolean;
	instruction: string;
	disabled: boolean;
	onInstructionChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<form onSubmit={onSubmit} className="flex gap-2 mb-3">
			<input
				type="text"
				aria-label={
					inProposalMode ? "Update proposal instruction" : "One-off organization instruction"
				}
				value={instruction}
				onChange={(event) => onInstructionChange(event.target.value)}
				placeholder={inProposalMode ? "Update proposal..." : "One-off instruction..."}
				className="min-w-0 flex-1 px-2.5 py-2 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400"
			/>
			<button
				type="submit"
				disabled={disabled}
				className="px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{inProposalMode ? "Update" : "Organize"}
			</button>
		</form>
	);
}

export function App() {
	const { status, codexConnected } = useServerHealth();
	const { tabs, groups, loading: tabsLoading, refresh } = useTabs();
	const { settings, update: updateSettings, refresh: refreshSettings } = useSettings();
	const {
		suggestions,
		reasoning,
		loading: organizing,
		refining,
		error,
		originalGroupIds,
		scanProgress,
		memoryCandidates,
		storeSuggestions,
		ungrouped,
		organizeMessage,
		organize,
		refine,
		applySuggestions,
		dismiss,
	} = useOrganize();
	const {
		memories,
		update: updateMemory,
		remove: removeMemory,
		clearAll: clearMemories,
		add: addMemory,
		aiEdit: aiEditMemories,
		refresh: refreshMemories,
	} = useMemory();
	const { testMode, toggle: toggleTestMode } = useTestMode();
	const [activePanel, setActivePanel] = useState<Panel>(null);
	const [instruction, setInstruction] = useState("");
	const [confirmUngroupAll, setConfirmUngroupAll] = useState(false);

	useEffect(() => {
		if (status !== "online") return;
		void refreshSettings();
		void refreshMemories();
	}, [refreshMemories, refreshSettings, status]);

	const handleOrganize = () => organize(tabs, groups, instruction);

	const handleApply = async (applied: typeof suggestions) => {
		if (!applied || testMode) return;
		await applySuggestions(applied);
		refresh();
	};

	const handleRefine = async (feedback: string, targetGroupName?: string, targetTabId?: number) => {
		await refine(feedback, targetGroupName, targetTabId);
		refreshMemories();
	};

	const handleInstructionSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const text = instruction.trim();
		if (inProposalMode) {
			if (!text) return;
			await handleRefine(text);
			setInstruction("");
			return;
		}
		await organize(tabs, groups, text);
	};

	const handleRenameGroup = async (groupId: number, title: string) => {
		await updateGroup(groupId, { title });
		refresh();
	};

	const handleDeleteGroup = async (groupId: number) => {
		const group = groups.find((g) => g.id === groupId);
		if (group) {
			await ungroupTabs(group.tabIds);
			await collapseAndReorderGroups();
			refresh();
		}
	};

	const handleMoveTab = async (tabId: number, groupId: number) => {
		await moveTabToGroup(tabId, groupId);
		await collapseAndReorderGroups();
		refresh();
	};

	const handleUngroupTab = async (tabId: number) => {
		await ungroupTabs([tabId]);
		await collapseAndReorderGroups();
		refresh();
	};

	const handleUngroupAllGroups = async () => {
		const allGroupedTabIds = groups.flatMap((g) => g.tabIds);
		if (allGroupedTabIds.length > 0) {
			await ungroupTabs(allGroupedTabIds);
			refresh();
		}
	};

	const handleUngroupAllClick = async () => {
		if (!confirmUngroupAll) {
			setConfirmUngroupAll(true);
			window.setTimeout(() => setConfirmUngroupAll(false), 3000);
			return;
		}
		setConfirmUngroupAll(false);
		await handleUngroupAllGroups();
	};

	const handleStoreGroup = async (group: TabGroupInfo) => {
		const groupTabs = tabs.filter((tab) => group.tabIds.includes(tab.id));
		if (groupTabs.length === 0) return;
		const availability = await serverApi.lookupSummaryAvailability(groupTabs.map((tab) => tab.url));
		const storedTabs = await buildStoredTabInputs(groupTabs, availability);
		if (storedTabs.length === 0) {
			window.alert("This group has no restorable http(s) tabs to store.");
			return;
		}
		await serverApi.createStoredSet({
			name: group.title || "Stored Tabs",
			color: group.color,
			tabs: storedTabs,
		});
		await closeTabs(groupTabs.map((tab) => tab.id));
		refresh();
	};

	const handleStoreSuggestion = async (suggestion: StoredTabSetSuggestion) => {
		const selectedTabs = tabs.filter((tab) => suggestion.tabIds.includes(tab.id));
		if (selectedTabs.length === 0) return;
		if (
			!window.confirm(
				`Store ${selectedTabs.length} tabs in "${suggestion.setName}" and close them?`,
			)
		) {
			return;
		}
		const availability = await serverApi.lookupSummaryAvailability(
			selectedTabs.map((tab) => tab.url),
		);
		const storedTabs = await buildStoredTabInputs(selectedTabs, availability);
		if (storedTabs.length === 0) {
			window.alert("The selected suggestion has no restorable http(s) tabs to store.");
			return;
		}
		await serverApi.appendStoredTabs(suggestion.setId, {
			tabs: storedTabs,
		});
		await closeTabs(selectedTabs.map((tab) => tab.id));
		dismiss();
		refresh();
	};

	const inProposalMode = suggestions !== null;

	return (
		<div className="p-3 min-h-screen bg-gray-50 dark:bg-gray-900">
			<AppHeader
				organizing={organizing}
				organizeMessage={organizeMessage}
				organizeDisabled={
					status !== "online" || !codexConnected || tabs.length === 0 || inProposalMode
				}
				confirmUngroupAll={confirmUngroupAll}
				ungroupAllDisabled={groups.length === 0 || inProposalMode}
				status={status}
				testMode={testMode}
				onOrganize={handleOrganize}
				onUngroupAll={handleUngroupAllClick}
				onOpenMemory={() => setActivePanel("memory")}
				onOpenStored={() => setActivePanel("stored")}
				onOpenSettings={() => setActivePanel("settings")}
			/>
			<StatusBanners status={status} codexConnected={codexConnected} error={error} />
			<ScanProgressNotice scanProgress={scanProgress} />
			<InstructionForm
				inProposalMode={inProposalMode}
				instruction={instruction}
				disabled={
					status !== "online" ||
					!codexConnected ||
					tabs.length === 0 ||
					organizing ||
					refining ||
					(inProposalMode && !instruction.trim())
				}
				onInstructionChange={setInstruction}
				onSubmit={handleInstructionSubmit}
			/>

			{/* Tab count */}
			{!tabsLoading && !inProposalMode && (
				<div className="text-xs text-gray-400 dark:text-gray-500 mb-2">
					{tabs.length} tabs{groups.length > 0 ? ` · ${groups.length} groups` : ""}
					{memories.length > 0 ? ` · ${memories.length} memories` : ""}
				</div>
			)}

			{/* Main content: either proposal view or current tabs */}
			{inProposalMode ? (
				<ProposalView
					suggestions={suggestions}
					reasoning={reasoning}
					tabs={tabs}
					originalGroupIds={originalGroupIds}
					refining={refining}
					testMode={testMode}
					memoryCandidates={memoryCandidates}
					storeSuggestions={storeSuggestions}
					ungrouped={ungrouped}
					onRefine={handleRefine}
					onApply={handleApply}
					onSaveMemoryCandidate={async (observation) => {
						await addMemory(observation);
					}}
					onStoreSuggestion={handleStoreSuggestion}
					onDismiss={dismiss}
				/>
			) : tabsLoading ? (
				<div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
					Loading tabs&hellip;
				</div>
			) : (
				<TabList
					tabs={tabs}
					groups={groups}
					scanProgress={scanProgress}
					serverOnline={status === "online"}
					onRenameGroup={handleRenameGroup}
					onDeleteGroup={handleDeleteGroup}
					onMoveTab={handleMoveTab}
					onUngroupTab={handleUngroupTab}
					onStoreGroup={handleStoreGroup}
				/>
			)}

			{/* Settings panel */}
			{activePanel === "settings" && (
				<SettingsPanel
					settings={settings}
					testMode={testMode}
					onToggleTestMode={toggleTestMode}
					onUpdate={updateSettings}
					onClose={() => setActivePanel(null)}
				/>
			)}

			{/* Memory panel */}
			{activePanel === "memory" && (
				<MemoryManager
					memories={memories}
					onUpdate={updateMemory}
					onDelete={removeMemory}
					onClearAll={clearMemories}
					onAIEdit={aiEditMemories}
					onClose={() => setActivePanel(null)}
				/>
			)}

			{activePanel === "stored" && (
				<StoredSetsManager onClose={() => setActivePanel(null)} onRestored={refresh} />
			)}
		</div>
	);
}
