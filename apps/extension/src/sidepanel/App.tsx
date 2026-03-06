import { useState } from "react";
import { GroupProposal } from "./components/GroupProposal.js";
import { MemoryManager } from "./components/MemoryManager.js";
import { OrganizeButton } from "./components/OrganizeButton.js";
import { RuleEditor } from "./components/RuleEditor.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TabList } from "./components/TabList.js";
import { useMemory } from "./hooks/useMemory.js";
import { useOrganize } from "./hooks/useOrganize.js";
import { useRules } from "./hooks/useRules.js";
import { useServerHealth } from "./hooks/useServerHealth.js";
import { useSettings } from "./hooks/useSettings.js";
import { useTabs } from "./hooks/useTabs.js";
import { useTestMode } from "./hooks/useTestMode.js";
import { moveTabToGroup, ungroupTabs, updateGroup } from "./services/chromeTabsApi.js";

type Panel = "settings" | "rules" | "memory" | null;

export function App() {
	const { status, codexConnected } = useServerHealth();
	const { tabs, groups, loading: tabsLoading, refresh } = useTabs();
	const { settings, update: updateSettings } = useSettings();
	const {
		suggestions,
		reasoning,
		loading: organizing,
		error,
		organize,
		applySuggestions,
		dismiss,
	} = useOrganize();
	const { rules, create: createRule, update: updateRule, remove: removeRule } = useRules();
	const { memories, remove: removeMemory, clearAll: clearMemories } = useMemory();
	const { testMode, toggle: toggleTestMode } = useTestMode();
	const [activePanel, setActivePanel] = useState<Panel>(null);

	const handleOrganize = () => organize(tabs, groups, settings?.contentDepth);

	const handleApply = async (applied: typeof suggestions) => {
		if (!applied) return;
		await applySuggestions(applied, tabs);
		refresh();
	};

	const handleRenameGroup = async (groupId: number, title: string) => {
		await updateGroup(groupId, { title });
		refresh();
	};

	const handleDeleteGroup = async (groupId: number) => {
		const group = groups.find((g) => g.id === groupId);
		if (group) {
			await ungroupTabs(group.tabIds);
			refresh();
		}
	};

	const handleMoveTab = async (tabId: number, groupId: number) => {
		await moveTabToGroup(tabId, groupId);
		refresh();
	};

	const handleUngroupTab = async (tabId: number) => {
		await ungroupTabs([tabId]);
		refresh();
	};

	return (
		<div className="p-4 min-h-screen bg-gray-50 dark:bg-gray-900">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tab Organizer</h1>
				<div className="flex items-center gap-1">
					<span
						className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
							status === "online"
								? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
								: status === "offline"
									? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
									: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
						}`}
					>
						<span
							className={`w-1.5 h-1.5 rounded-full ${
								status === "online"
									? "bg-green-500"
									: status === "offline"
										? "bg-red-500"
										: "bg-yellow-500"
							}`}
						/>
						{status === "checking" ? "..." : status}
					</span>
					{testMode && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
							test
						</span>
					)}
					<button
						type="button"
						onClick={() => setActivePanel("rules")}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
						title="Rules"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
							/>
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setActivePanel("memory")}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
						title="Memory"
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

			{/* Offline banner */}
			{status === "offline" && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-red-700 text-[10px] dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					Server offline. Run <code className="font-mono">pnpm dev:server</code>
				</div>
			)}

			{/* Codex not connected banner */}
			{status === "online" && !codexConnected && (
				<div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-amber-700 text-[10px] dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400">
					Codex backend not connected. Ensure <code className="font-mono">codex</code> CLI is
					installed and available in PATH.
				</div>
			)}

			{/* Error banner */}
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-red-700 text-[10px] dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Organize button */}
			<div className="mb-3">
				<OrganizeButton
					onClick={handleOrganize}
					loading={organizing}
					disabled={status !== "online" || !codexConnected || tabs.length === 0}
				/>
			</div>

			{/* Tab count + rule count */}
			{!tabsLoading && (
				<div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
					{tabs.length} tabs{groups.length > 0 ? ` in ${groups.length} groups` : ""}
					{rules.length > 0 ? ` | ${rules.length} rules` : ""}
					{memories.length > 0 ? ` | ${memories.length} memories` : ""}
				</div>
			)}

			{/* Tab list */}
			{tabsLoading ? (
				<div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
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

			{/* Group proposal overlay */}
			{suggestions && (
				<GroupProposal
					suggestions={suggestions}
					reasoning={reasoning}
					tabs={tabs}
					testMode={testMode}
					onApply={handleApply}
					onDismiss={dismiss}
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

			{/* Rules panel */}
			{activePanel === "rules" && (
				<RuleEditor
					rules={rules}
					onCreate={createRule}
					onUpdate={updateRule}
					onDelete={removeRule}
					onClose={() => setActivePanel(null)}
				/>
			)}

			{/* Memory panel */}
			{activePanel === "memory" && (
				<MemoryManager
					memories={memories}
					onDelete={removeMemory}
					onClearAll={clearMemories}
					onClose={() => setActivePanel(null)}
				/>
			)}
		</div>
	);
}
