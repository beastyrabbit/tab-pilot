import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractTabContent } from "../services/chromeContentApi.js";
import { getCachedSummaries } from "../services/screenshotCache.js";
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
}

// ── Search hook ──────────────────────────────────────────────────────────

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

		// Extract page text from all tabs
		const cache = new Map<number, string>();
		const batchSize = 5;
		for (let i = 0; i < tabs.length; i += batchSize) {
			const batch = tabs.slice(i, i + batchSize);
			const results = await Promise.all(
				batch.map(async (tab) => {
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
				}),
			);
			for (const r of results) {
				cache.set(r.id, r.text);
			}
			setContentCache(new Map(cache));
		}

		// Load any AI summaries from the persistent screenshot cache
		const summaries = await getCachedSummaries(tabs);
		setSummaryCache(summaries);

		setIndexing(false);
	}, [tabs]);

	// Stable key that changes when tab identity (id or url) changes
	const tabIdentityKey = useMemo(() => tabs.map((t) => `${t.id}:${t.url}`).join("|"), [tabs]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset index when tab identity changes, not on every render
	useEffect(() => {
		indexedRef.current = false;
		setContentCache(new Map());
		setSummaryCache(new Map());
	}, [tabIdentityKey]);

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
	onMoveToGroup,
	onUngroup,
}: {
	tab: TabInfo;
	groups?: TabGroupInfo[];
	onMoveToGroup?: (tabId: number, groupId: number) => void;
	onUngroup?: (tabId: number) => void;
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `tab-${tab.id}`,
		data: { tabId: tab.id, groupId: tab.groupId },
	});

	return (
		<div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
			<TabItem tab={tab} groups={groups} onMoveToGroup={onMoveToGroup} onUngroup={onUngroup} />
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
			<div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded" />
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
}: TabListProps) {
	const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
	const ungroupedTabs = tabs.filter((t) => !groupedTabIds.has(t.id));

	const { query, setQuery, matchingTabIds, indexing } = useTabSearch(tabs);
	const [activeTab, setActiveTab] = useState<TabInfo | null>(null);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	const isVisible = (tabId: number) => matchingTabIds === null || matchingTabIds.has(tabId);

	const filteredGroups = groups
		.map((g) => ({ ...g, tabIds: g.tabIds.filter(isVisible) }))
		.filter((g) => g.tabIds.length > 0);

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
						className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500"
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
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search tabs (title, URL, content)..."
						className="w-full pl-8 pr-8 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400"
					/>
					{indexing && (
						<span
							className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"
							title="Indexing page content..."
						/>
					)}
					{query && !indexing && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
						>
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

				{matchingTabIds !== null && (
					<div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
						{matchingTabIds.size} tab{matchingTabIds.size !== 1 ? "s" : ""} found
						{indexing ? " (indexing...)" : ""}
					</div>
				)}

				{/* Groups as drop zones */}
				{filteredGroups.map((group) => (
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
							renderTab={(tab) => (
								<DraggableTab
									key={tab.id}
									tab={tab}
									groups={groups}
									onMoveToGroup={onMoveTab}
									onUngroup={onUngroupTab}
								/>
							)}
						/>
					</DroppableGroup>
				))}

				{/* Ungrouped drop zone */}
				<DroppableGroup id="ungrouped">
					{filteredUngrouped.length > 0 && (
						<div>
							<div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-1">
								Ungrouped ({filteredUngrouped.length})
							</div>
							{filteredUngrouped.map((tab) => (
								<DraggableTab key={tab.id} tab={tab} groups={groups} onMoveToGroup={onMoveTab} />
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
