import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { GroupCard } from "./GroupCard.js";
import { TabItem } from "./TabItem.js";

interface TabListProps {
	tabs: TabInfo[];
	groups: TabGroupInfo[];
	onRenameGroup?: (groupId: number, title: string) => void;
	onDeleteGroup?: (groupId: number) => void;
	onMoveTab?: (tabId: number, groupId: number) => void;
	onUngroupTab?: (tabId: number) => void;
}

const GROUP_COLORS: Record<string, string> = {
	grey: "border-gray-400",
	blue: "border-blue-500",
	red: "border-red-500",
	yellow: "border-yellow-500",
	green: "border-green-500",
	pink: "border-pink-500",
	purple: "border-purple-500",
	cyan: "border-cyan-500",
	orange: "border-orange-500",
};

export function TabList({
	tabs,
	groups,
	onRenameGroup,
	onDeleteGroup,
	onMoveTab,
	onUngroupTab,
}: TabListProps) {
	const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
	const ungroupedTabs = tabs.filter((t) => !groupedTabIds.has(t.id));

	return (
		<div className="space-y-2">
			{groups.map((group) => (
				<GroupCard
					key={group.id}
					group={group}
					tabs={tabs}
					allGroups={groups}
					colorClass={GROUP_COLORS[group.color] || "border-gray-400"}
					onRename={onRenameGroup}
					onDelete={onDeleteGroup}
					onMoveTab={onMoveTab}
					onUngroupTab={onUngroupTab}
				/>
			))}

			{ungroupedTabs.length > 0 && (
				<div>
					<div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-1">
						Ungrouped ({ungroupedTabs.length})
					</div>
					{ungroupedTabs.map((tab) => (
						<TabItem key={tab.id} tab={tab} groups={groups} onMoveToGroup={onMoveTab} />
					))}
				</div>
			)}
		</div>
	);
}
