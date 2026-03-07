import { useState } from "react";
import { MemoryManager } from "./components/MemoryManager.js";
import { OrganizeButton } from "./components/OrganizeButton.js";
import { ProposalView } from "./components/ProposalView.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TabList } from "./components/TabList.js";
import { useMemory } from "./hooks/useMemory.js";
import { useOrganize } from "./hooks/useOrganize.js";
import { useServerHealth } from "./hooks/useServerHealth.js";
import { useSettings } from "./hooks/useSettings.js";
import { useTabs } from "./hooks/useTabs.js";
import { useTestMode } from "./hooks/useTestMode.js";
import {
	collapseAndReorderGroups,
	moveTabToGroup,
	ungroupTabs,
	updateGroup,
} from "./services/chromeTabsApi.js";

type Panel = "settings" | "memory" | null;

export function App() {
	const { status, codexConnected } = useServerHealth();
	const { tabs, groups, loading: tabsLoading, refresh } = useTabs();
	const { settings, update: updateSettings } = useSettings();
	const {
		suggestions,
		reasoning,
		loading: organizing,
		refining,
		error,
		originalGroupIds,
		scanProgress,
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
		aiEdit: aiEditMemories,
		refresh: refreshMemories,
	} = useMemory();
	const { testMode, toggle: toggleTestMode } = useTestMode();
	const [activePanel, setActivePanel] = useState<Panel>(null);

	const handleOrganize = () => organize(tabs, groups, settings?.contentDepth);

	const handleApply = async (applied: typeof suggestions) => {
		if (!applied || testMode) return;
		await applySuggestions(applied);
		refresh();
	};

	const handleRefine = async (feedback: string, targetGroupName?: string, targetTabId?: number) => {
		await refine(feedback, targetGroupName, targetTabId);
		refreshMemories();
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

	const handleDissolveAllGroups = async () => {
		const allGroupedTabIds = groups.flatMap((g) => g.tabIds);
		if (allGroupedTabIds.length > 0) {
			await ungroupTabs(allGroupedTabIds);
			refresh();
		}
	};

	const inProposalMode = suggestions !== null;

	return (
		<div className="p-3 min-h-screen bg-gray-50 dark:bg-gray-900">
			{/* Header — single row: Organize button + status + icons */}
			<div className="flex items-center gap-2 mb-3">
				<OrganizeButton
					onClick={handleOrganize}
					loading={organizing}
					disabled={status !== "online" || !codexConnected || tabs.length === 0 || inProposalMode}
				/>
				<div className="flex items-center gap-1 flex-shrink-0">
					<span
						className={`w-2 h-2 rounded-full ${
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
						onClick={() => setActivePanel("memory")}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
						title="Memories"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
						onClick={() => setActivePanel("settings")}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
						title="Settings"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

			{/* Banners */}
			{status === "offline" && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-red-700 text-xs dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					Server offline. Run <code className="font-mono">pnpm dev:server</code>
				</div>
			)}
			{status === "online" && !codexConnected && (
				<div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-amber-700 text-xs dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400">
					Codex not connected. Ensure <code className="font-mono">codex</code> CLI is in PATH.
				</div>
			)}
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-red-700 text-xs dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Screenshot scan progress */}
			{scanProgress && scanProgress.phase !== "done" && (
				<div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 mb-2">
					<span className="w-2.5 h-2.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
					{scanProgress.phase === "capturing"
						? `Scanning tabs ${scanProgress.done}/${scanProgress.total}`
						: `AI summarizing ${scanProgress.done}/${scanProgress.total}`}
				</div>
			)}

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
					onRefine={handleRefine}
					onApply={handleApply}
					onDismiss={dismiss}
				/>
			) : tabsLoading ? (
				<div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
					Loading tabs...
				</div>
			) : (
				<TabList
					tabs={tabs}
					groups={groups}
					onRenameGroup={handleRenameGroup}
					onDeleteGroup={handleDeleteGroup}
					onMoveTab={handleMoveTab}
					onUngroupTab={handleUngroupTab}
				/>
			)}

			{/* Settings panel */}
			{activePanel === "settings" && (
				<SettingsPanel
					settings={settings}
					testMode={testMode}
					onToggleTestMode={toggleTestMode}
					onUpdate={updateSettings}
					onDissolveAllGroups={handleDissolveAllGroups}
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
		</div>
	);
}
