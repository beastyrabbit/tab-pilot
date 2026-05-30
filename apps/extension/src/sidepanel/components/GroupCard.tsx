import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { type ReactNode, useRef, useState } from "react";
import type { SummaryStatus } from "../services/screenshotCache.js";
import { TabItem } from "./TabItem.js";

interface GroupCardProps {
	group: TabGroupInfo;
	tabs: TabInfo[];
	allGroups: TabGroupInfo[];
	borderColor: string;
	onRename?: (groupId: number, title: string) => void;
	onDelete?: (groupId: number) => void;
	onMoveTab?: (tabId: number, groupId: number) => void;
	onUngroupTab?: (tabId: number) => void;
	onStore?: (group: TabGroupInfo) => Promise<void>;
	summaryStatuses?: Map<number, SummaryStatus>;
	children?: ReactNode;
}

export function GroupCard({
	group,
	tabs,
	allGroups,
	borderColor,
	onRename,
	onDelete,
	onMoveTab,
	onUngroupTab,
	onStore,
	summaryStatuses,
	children,
}: GroupCardProps) {
	const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
	const [editing, setEditing] = useState(false);
	const [draftTitle, setDraftTitle] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const groupTabs = tabs.filter((t) => group.tabIds.includes(t.id));
	const collapsed = collapsedOverride ?? group.collapsed;
	const editTitle = draftTitle ?? group.title ?? "";

	const startEditing = () => {
		setDraftTitle(group.title || "");
		setEditing(true);
		window.requestAnimationFrame(() => inputRef.current?.focus());
	};

	const handleRename = () => {
		if (onRename && editTitle.trim()) {
			onRename(group.id, editTitle.trim());
		}
		setEditing(false);
		setDraftTitle(null);
	};

	return (
		<div
			className="rounded-lg bg-white dark:bg-gray-800"
			style={{ boxShadow: `inset 3px 0 0 ${borderColor}` }}
		>
			<div className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 group/card">
				{editing ? (
					<input
						ref={inputRef}
						type="text"
						aria-label="Group title"
						value={editTitle}
						onChange={(e) => setDraftTitle(e.target.value)}
						onBlur={handleRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename();
							if (e.key === "Escape") {
								setEditing(false);
								setDraftTitle(null);
							}
						}}
						className="text-xs font-semibold text-gray-700 dark:text-gray-200 border-b border-blue-500 outline-none bg-transparent w-full"
					/>
				) : (
					<button
						type="button"
						onClick={() => setCollapsedOverride(!collapsed)}
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
							aria-label="Rename group"
							onClick={startEditing}
							className="invisible group-hover/card:visible text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-0.5"
							title="Rename"
						>
							<svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
								/>
							</svg>
						</button>
					)}
					{onStore && (
						<button
							type="button"
							aria-label="Store group"
							onClick={async () => {
								const name = group.title || "Untitled";
								if (!window.confirm(`Store "${name}" and close ${groupTabs.length} tabs?`)) {
									return;
								}
								await onStore(group);
							}}
							className="invisible group-hover/card:visible text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 p-0.5"
							title="Store group"
						>
							<svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 5h14v14l-7-4-7 4V5z"
								/>
							</svg>
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							aria-label="Ungroup all tabs in this group"
							onClick={() => onDelete(group.id)}
							className="invisible group-hover/card:visible text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-0.5"
							title="Ungroup all"
						>
							<svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
						{collapsed ? "+" : "\u2212"}
					</span>
				</div>
			</div>
			{!collapsed && (
				<div className="pb-1">
					{children ??
						groupTabs.map((tab) => (
							<TabItem
								key={tab.id}
								tab={tab}
								groups={allGroups}
								summaryStatus={summaryStatuses?.get(tab.id)}
								onMoveToGroup={onMoveTab}
								onUngroup={onUngroupTab}
							/>
						))}
				</div>
			)}
		</div>
	);
}
