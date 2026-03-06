import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useState } from "react";
import { TabItem } from "./TabItem.js";

interface GroupCardProps {
	group: TabGroupInfo;
	tabs: TabInfo[];
	allGroups: TabGroupInfo[];
	colorClass: string;
	onRename?: (groupId: number, title: string) => void;
	onDelete?: (groupId: number) => void;
	onMoveTab?: (tabId: number, groupId: number) => void;
	onUngroupTab?: (tabId: number) => void;
}

export function GroupCard({
	group,
	tabs,
	allGroups,
	colorClass,
	onRename,
	onDelete,
	onMoveTab,
	onUngroupTab,
}: GroupCardProps) {
	const [collapsed, setCollapsed] = useState(group.collapsed);
	const [editing, setEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(group.title || "");
	const groupTabs = tabs.filter((t) => group.tabIds.includes(t.id));

	const handleRename = () => {
		if (onRename && editTitle.trim()) {
			onRename(group.id, editTitle.trim());
		}
		setEditing(false);
	};

	return (
		<div className={`border-l-2 ${colorClass} rounded-r-lg bg-white dark:bg-gray-800`}>
			<div className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 group/card">
				{editing ? (
					<input
						type="text"
						value={editTitle}
						onChange={(e) => setEditTitle(e.target.value)}
						onBlur={handleRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename();
							if (e.key === "Escape") setEditing(false);
						}}
						className="text-xs font-semibold text-gray-700 dark:text-gray-200 border-b border-blue-500 outline-none bg-transparent w-full"
						autoFocus
					/>
				) : (
					<button
						type="button"
						onClick={() => setCollapsed(!collapsed)}
						className="flex-1 text-left"
					>
						<span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
							{group.title || "Untitled"} ({groupTabs.length})
						</span>
					</button>
				)}
				<div className="flex items-center gap-1">
					{!editing && onRename && (
						<button
							type="button"
							onClick={() => setEditing(true)}
							className="invisible group-hover/card:visible text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-0.5"
							title="Rename"
						>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
								/>
							</svg>
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							onClick={() => onDelete(group.id)}
							className="invisible group-hover/card:visible text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-0.5"
							title="Ungroup all"
						>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					)}
					<span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
						{collapsed ? "+" : "-"}
					</span>
				</div>
			</div>
			{!collapsed && (
				<div className="pb-1">
					{groupTabs.map((tab) => (
						<TabItem
							key={tab.id}
							tab={tab}
							groups={allGroups}
							onMoveToGroup={onMoveTab}
							onUngroup={onUngroupTab}
						/>
					))}
				</div>
			)}
		</div>
	);
}
