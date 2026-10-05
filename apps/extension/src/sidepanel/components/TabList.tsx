import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractTabContent } from "../services/chromeContentApi.js";
import {
	getCachedSummaries,
	getSummaryStatuses,
	type ScanProgress,
	type SummaryStatus,
} from "../services/screenshotCache.js";
import { CHROME_GROUP_COLORS } from "../utils/chromeColors.js";
import { GroupCard } from "./GroupCard.js";
import { TabItem } from "./TabItem.js";

interface TabListProps {
	tabs: TabInfo[];
	groups: TabGroupInfo[];
	onRenameGroup?: (groupId: number, title: string) => void;
	onDeleteGroup?: (groupId: number) => void;
	onMoveTab?: (tabId: number, groupId: number) => void;
	onUngroupTab?: (tabId: number) => void;
	onStoreGroup?: (group: TabGroupInfo) => Promise<void>;
	fixedGroupIds?: Set<number>;
	onToggleFixedGroup?: (group: TabGroupInfo, fixed: boolean) => void;
	scanProgress?: ScanProgress | null;
	serverOnline?: boolean;
}

// ── Search hook ──────────────────────────────────────────────────────────

async function readTabSearchText(tab: TabInfo): Promise<{ id: number; text: string }> {
	if (!tab.url.startsWith("http")) return { id: tab.id, text: "" };
	const content = await extractTabContent(tab.id, true);
	const text = [
		content?.metaDescription,
		content?.ogDescription,
		content?.keywords,
		content?.pageText,
	]
		.filter(Boolean)
		.join(" ");
	return { id: tab.id, text };
}

function useTabSearch(tabs: TabInfo[]) {
	const [query, setQuery] = useState("");
	const [contentCache, setContentCache] = useState<Map<number, string>>(new Map());
	const [summaryCache, setSummaryCache] = useState<Map<number, string>>(new Map());
	const [indexing, setIndexing] = useState(false);
	const indexedRef = useRef(false);

	const buildIndex = useCallback(async () => {
		if (indexedRef.current || tabs.length === 0) return;
		indexedRef.current = true;
		setIndexing(true);

		// Extract page text from all tabs with bounded concurrency.
		const cache = new Map<number, string>();
		let nextIndex = 0;
		const runWorker = async (): Promise<void> => {
			const tab = tabs[nextIndex];
			nextIndex += 1;
			if (!tab) return;
			const result = await readTabSearchText(tab);
			cache.set(result.id, result.text);
			setContentCache(new Map(cache));
			await runWorker();
		};
		await Promise.all(Array.from({ length: Math.min(5, tabs.length) }, () => runWorker()));

		// Load any AI summaries from the persistent screenshot cache
		const summaries = await getCachedSummaries(tabs);
		setSummaryCache(summaries);

		setIndexing(false);
	}, [tabs]);

	// Stable key that changes when tab identity (id or url) changes
	const tabIdentityKey = useMemo(() => tabs.map((t) => `${t.id}:${t.url}`).join("|"), [tabs]);
	const [indexedTabIdentityKey, setIndexedTabIdentityKey] = useState(tabIdentityKey);

	if (indexedTabIdentityKey !== tabIdentityKey) {
		indexedRef.current = false;
		setIndexedTabIdentityKey(tabIdentityKey);
		setContentCache(new Map());
		setSummaryCache(new Map());
	}

	const handleQueryChange = useCallback(
		(q: string) => {
			setQuery(q);
			if (q.trim().length > 0) buildIndex();
		},
		[buildIndex],
	);

	const matchingTabIds: Set<number> | null = (() => {
		const q = query.trim().toLowerCase();
		if (!q) return null;
		const matched = new Set<number>();
		for (const tab of tabs) {
			const titleMatch = tab.title.toLowerCase().includes(q);
			const urlMatch = tab.url.toLowerCase().includes(q);
			const contentMatch = (contentCache.get(tab.id) || "").toLowerCase().includes(q);
			const summaryMatch = (summaryCache.get(tab.id) || "").toLowerCase().includes(q);
			if (titleMatch || urlMatch || contentMatch || summaryMatch) matched.add(tab.id);
		}
		return matched;
	})();

	return { query, setQuery: handleQueryChange, matchingTabIds, indexing };
}

// ── Draggable tab wrapper ────────────────────────────────────────────────

function DraggableTab({
	tab,
	groups,
	summaryStatus,
	onMoveToGroup,
	onUngroup,
}: {
	tab: TabInfo;
	groups?: TabGroupInfo[];
	summaryStatus?: SummaryStatus;
	onMoveToGroup?: (tabId: number, groupId: number) => void;
	onUngroup?: (tabId: number) => void;
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `tab-${tab.id}`,
		data: { tabId: tab.id, groupId: tab.groupId },
	});

	return (
		<div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
			<TabItem
				tab={tab}
				groups={groups}
				summaryStatus={summaryStatus}
				onMoveToGroup={onMoveToGroup}
				onUngroup={onUngroup}
			/>
		</div>
	);
}

// ── Droppable group wrapper ──────────────────────────────────────────────

function DroppableGroup({ id, children }: { id: string; children: React.ReactNode }) {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div
			ref={setNodeRef}
			className={
				isOver
					? "ring-2 ring-blue-400 ring-offset-1 rounded-lg transition-shadow"
					: "transition-shadow"
			}
		>
			{children}
		</div>
	);
}

// ── Drag overlay (ghost preview) ─────────────────────────────────────────

function DragPreview({ tab }: { tab: TabInfo }) {
	const domain = (() => {
		try {
			return new URL(tab.url).hostname;
		} catch {
			return tab.url;
		}
	})();

	return (
		<div className="flex items-center gap-2 py-1.5 px-3 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-blue-400 opacity-90 max-w-[280px]">
			<div className="size-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded" />
			<div className="min-w-0 flex-1">
				<div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
					{tab.title}
				</div>
				<div className="text-[10px] text-gray-400 truncate">{domain}</div>
			</div>
		</div>
	);
}

// ── Main TabList ─────────────────────────────────────────────────────────

export function TabList({
	tabs,
	groups,
	onRenameGroup,
	onDeleteGroup,
	onMoveTab,
	onUngroupTab,
	onStoreGroup,
	fixedGroupIds = new Set(),
	onToggleFixedGroup,
	scanProgress,
	serverOnline = true,
}: Readonly<TabListProps>) {
	const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
	const ungroupedTabs = tabs.filter((t) => !groupedTabIds.has(t.id));

	const { query, setQuery, matchingTabIds, indexing } = useTabSearch(tabs);
	const [activeTab, setActiveTab] = useState<TabInfo | null>(null);
	const [baseSummaryStatuses, setBaseSummaryStatuses] = useState<Map<number, SummaryStatus>>(
		new Map(),
	);
	useEffect(() => {
		if (!serverOnline) return;
		let cancelled = false;
		getSummaryStatuses(tabs).then((statuses) => {
			if (!cancelled) setBaseSummaryStatuses(statuses);
		});
		return () => {
			cancelled = true;
		};
	}, [serverOnline, tabs]);

	const summaryStatuses = baseSummaryStatuses;

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
	const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);

	const isVisible = (tabId: number) => matchingTabIds === null || matchingTabIds.has(tabId);

	const filteredGroups: TabGroupInfo[] = [];
	for (const group of groups) {
		const visibleTabIds: number[] = [];
		for (const tabId of group.tabIds) {
			if (isVisible(tabId)) visibleTabIds.push(tabId);
		}
		if (visibleTabIds.length > 0) {
			filteredGroups.push({ ...group, tabIds: visibleTabIds });
		}
	}

	const filteredUngrouped = ungroupedTabs.filter((t) => isVisible(t.id));

	const handleDragStart = (event: DragStartEvent) => {
		const tabId = (event.active.data.current as { tabId: number })?.tabId;
		const tab = tabs.find((t) => t.id === tabId);
		setActiveTab(tab || null);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveTab(null);
		const { active, over } = event;
		if (!over) return;

		const tabId = (active.data.current as { tabId: number })?.tabId;
		const sourceGroupId = (active.data.current as { groupId: number })?.groupId;
		const targetId = over.id as string;

		if (targetId === "ungrouped") {
			// Drop onto ungrouped zone
			if (sourceGroupId !== undefined && sourceGroupId !== -1 && onUngroupTab) {
				onUngroupTab(tabId);
			}
		} else if (targetId.startsWith("group-")) {
			// Drop onto a group
			const groupId = Number(targetId.replace("group-", ""));
			if (groupId !== sourceGroupId && onMoveTab) {
				onMoveTab(tabId, groupId);
			}
		}
	};

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			<div className="space-y-2">
				{/* Search bar */}
				<div className="relative">
					<svg
						className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 dark:text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						type="text"
						aria-label="Search tabs"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search tabs (title, URL, content)..."
						className="w-full pl-8 pr-8 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400"
					/>
					{indexing && (
						<span
							className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"
							title="Indexing page content..."
						/>
					)}
					{query && !indexing && (
						<button
							type="button"
							aria-label="Clear search"
							onClick={() => setQuery("")}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
						>
							<svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					)}
				</div>

				<div className="flex items-center justify-between gap-2 px-1">
					<div className="text-[10px] text-gray-400 dark:text-gray-500">
						"AI context is loaded when needed"
					</div>
				</div>

				{matchingTabIds !== null && (
					<div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
						{matchingTabIds.size} tab{matchingTabIds.size !== 1 ? "s" : ""} found
						{indexing ? " (indexing...)" : ""}
					</div>
				)}

				{/* Groups as drop zones */}
				{filteredGroups.map((group) => {
					const groupTabs: TabInfo[] = [];
					for (const tabId of group.tabIds) {
						const tab = tabById.get(tabId);
						if (tab) groupTabs.push(tab);
					}
					return (
						<DroppableGroup key={group.id} id={`group-${group.id}`}>
							<GroupCard
								group={group}
								tabs={tabs}
								allGroups={groups}
								borderColor={CHROME_GROUP_COLORS[group.color] || CHROME_GROUP_COLORS.grey}
								onRename={onRenameGroup}
								onDelete={onDeleteGroup}
								onMoveTab={onMoveTab}
								onUngroupTab={onUngroupTab}
								onStore={onStoreGroup}
								fixed={fixedGroupIds.has(group.id)}
								onToggleFixed={onToggleFixedGroup}
								summaryStatuses={summaryStatuses}
							>
								{groupTabs.map((tab) => (
									<DraggableTab
										key={tab.id}
										tab={tab}
										groups={groups}
										summaryStatus={summaryStatuses.get(tab.id)}
										onMoveToGroup={onMoveTab}
										onUngroup={onUngroupTab}
									/>
								))}
							</GroupCard>
						</DroppableGroup>
					);
				})}

				{/* Ungrouped drop zone */}
				<DroppableGroup id="ungrouped">
					{filteredUngrouped.length > 0 && (
						<div>
							<div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-1">
								Ungrouped ({filteredUngrouped.length})
							</div>
							{filteredUngrouped.map((tab) => (
								<DraggableTab
									key={tab.id}
									tab={tab}
									groups={groups}
									summaryStatus={summaryStatuses.get(tab.id)}
									onMoveToGroup={onMoveTab}
								/>
							))}
						</div>
					)}
					{filteredUngrouped.length === 0 && groups.length > 0 && (
						<div className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center">
							Drop here to ungroup
						</div>
					)}
				</DroppableGroup>

				{matchingTabIds !== null && matchingTabIds.size === 0 && (
					<div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
						No tabs match "{query}"
					</div>
				)}
			</div>

			<DragOverlay dropAnimation={null}>
				{activeTab ? <DragPreview tab={activeTab} /> : null}
			</DragOverlay>
		</DndContext>
	);
}
