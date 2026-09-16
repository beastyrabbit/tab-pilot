import type {
	GroupingSuggestion,
	MemoryCandidate,
	StoredTabSetSuggestion,
	TabInfo,
	UngroupedTabReason,
} from "@tab-orga/shared";
import { type Dispatch, useMemo, useReducer, useState } from "react";
import { chromeBgStyle, chromeBorderStyle } from "../utils/chromeColors.js";

interface ProposalViewProps {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	tabs: TabInfo[];
	originalGroupIds: Map<number, number>;
	refining: boolean;
	testMode: boolean;
	memoryCandidates: MemoryCandidate[];
	storeSuggestions: StoredTabSetSuggestion[];
	ungrouped: UngroupedTabReason[];
	onRefine: (feedback: string, targetGroupName?: string, targetTabId?: number) => void;
	onApply: (suggestions: GroupingSuggestion[]) => void;
	onSaveMemoryCandidate: (observation: string) => Promise<void>;
	onStoreSuggestion: (suggestion: StoredTabSetSuggestion) => Promise<void>;
	onDismiss: () => void;
}

type TabStatus = "unchanged" | "moved" | "newly-grouped";
type ProposalGroupKey = number | string;

interface ProposalState {
	expandedGroup: ProposalGroupKey | null;
	selectedTab: number | null;
	dismissedMemoryRows: Set<string>;
	savingMemoryRows: Set<string>;
	dismissedStoreRows: Set<string>;
	savingStoreRows: Set<string>;
}

type ProposalAction =
	| { type: "toggleGroup"; key: ProposalGroupKey }
	| { type: "toggleTab"; tabId: number }
	| { type: "dismissMemory"; key: string }
	| { type: "savingMemory"; key: string; saving: boolean }
	| { type: "dismissStore"; key: string }
	| { type: "savingStore"; key: string; saving: boolean };

const STATUS_LED: Record<TabStatus, { color: string; label: string }> = {
	unchanged: { color: "bg-green-400", label: "Not moved" },
	moved: { color: "bg-yellow-400", label: "Moved" },
	"newly-grouped": { color: "bg-purple-400", label: "From ungrouped" },
};

function createProposalState(): ProposalState {
	return {
		expandedGroup: null,
		selectedTab: null,
		dismissedMemoryRows: new Set(),
		savingMemoryRows: new Set(),
		dismissedStoreRows: new Set(),
		savingStoreRows: new Set(),
	};
}

function withSetEntry(source: Set<string>, key: string, present: boolean): Set<string> {
	const next = new Set(source);
	if (present) {
		next.add(key);
	} else {
		next.delete(key);
	}
	return next;
}

function proposalReducer(state: ProposalState, action: ProposalAction): ProposalState {
	switch (action.type) {
		case "toggleGroup":
			return {
				...state,
				expandedGroup: state.expandedGroup === action.key ? null : action.key,
			};
		case "toggleTab":
			return {
				...state,
				selectedTab: state.selectedTab === action.tabId ? null : action.tabId,
			};
		case "dismissMemory":
			return {
				...state,
				dismissedMemoryRows: withSetEntry(state.dismissedMemoryRows, action.key, true),
			};
		case "savingMemory":
			return {
				...state,
				savingMemoryRows: withSetEntry(state.savingMemoryRows, action.key, action.saving),
			};
		case "dismissStore":
			return {
				...state,
				dismissedStoreRows: withSetEntry(state.dismissedStoreRows, action.key, true),
			};
		case "savingStore":
			return {
				...state,
				savingStoreRows: withSetEntry(state.savingStoreRows, action.key, action.saving),
			};
	}
}

function getTabStatus(
	tabId: number,
	suggestion: GroupingSuggestion,
	originalGroupIds: Map<number, number>,
): TabStatus {
	const originalGroup = originalGroupIds.get(tabId);
	if (originalGroup === undefined || originalGroup === -1) return "newly-grouped";
	if (suggestion.existingGroupId != null && suggestion.existingGroupId === originalGroup) {
		return "unchanged";
	}
	return "moved";
}

function domain(url: string) {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function memoryCandidateKey(candidate: MemoryCandidate): string {
	return `${candidate.observation}\n${candidate.reason}`;
}

function storeSuggestionKey(suggestion: StoredTabSetSuggestion): string {
	return `${suggestion.setId}:${suggestion.tabIds.join(",")}`;
}

function Favicon({
	url,
	pageUrl,
	className,
}: {
	url?: string;
	pageUrl?: string;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	const [chromeFailed, setChromeFailed] = useState(false);

	const chromeFaviconUrl = (() => {
		if (!pageUrl) return null;
		try {
			return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
		} catch {
			return null;
		}
	})();

	if ((!url || failed) && (!chromeFaviconUrl || chromeFailed)) {
		return <div className={`${className} bg-gray-300 dark:bg-gray-600 rounded`} />;
	}

	if (!url || failed) {
		return (
			<img
				src={chromeFaviconUrl!}
				alt=""
				className={className}
				onError={() => setChromeFailed(true)}
			/>
		);
	}

	return <img src={url} alt="" className={className} onError={() => setFailed(true)} />;
}

function FeedbackInput({
	placeholder,
	disabled,
	onSubmit,
}: {
	placeholder: string;
	disabled: boolean;
	onSubmit: (text: string) => void;
}) {
	const [text, setText] = useState("");

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && text.trim() && !disabled) {
			onSubmit(text.trim());
			setText("");
		}
	};

	return (
		<input
			type="text"
			aria-label={placeholder}
			value={text}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={disabled ? "Refining..." : placeholder}
			disabled={disabled}
			className="w-full mt-1.5 px-2.5 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
		/>
	);
}

function ProposalHeader({ refining }: { refining: boolean }) {
	return (
		<div className="flex items-center justify-between">
			<h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Proposed Groups</h2>
			{refining && (
				<span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
					<span className="size-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
					Refining&hellip;
				</span>
			)}
		</div>
	);
}

function MemoryCandidateList({
	candidates,
	state,
	dispatch,
	onSave,
}: {
	candidates: MemoryCandidate[];
	state: ProposalState;
	dispatch: Dispatch<ProposalAction>;
	onSave: (observation: string) => Promise<void>;
}) {
	if (candidates.length === 0) return null;

	return (
		<div className="space-y-1.5">
			{candidates.map((candidate) => {
				const candidateKey = memoryCandidateKey(candidate);
				if (state.dismissedMemoryRows.has(candidateKey)) return null;
				const saving = state.savingMemoryRows.has(candidateKey);
				return (
					<div
						key={candidateKey}
						className="border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg px-2.5 py-2"
					>
						<div className="text-xs text-amber-900 dark:text-amber-200">
							{candidate.observation}
						</div>
						<div className="flex items-center gap-1.5 mt-1.5">
							<button
								type="button"
								disabled={saving}
								onClick={async () => {
									dispatch({ type: "savingMemory", key: candidateKey, saving: true });
									try {
										await onSave(candidate.observation);
										dispatch({ type: "dismissMemory", key: candidateKey });
									} catch (error) {
										console.warn("[memory] Failed to save candidate:", error);
									} finally {
										dispatch({ type: "savingMemory", key: candidateKey, saving: false });
									}
								}}
								className="px-2 py-1 text-[10px] font-medium text-amber-900 bg-amber-200 rounded hover:bg-amber-300 disabled:opacity-50 dark:text-amber-100 dark:bg-amber-700 dark:hover:bg-amber-600"
							>
								{saving ? "Saving..." : "Save this as memory?"}
							</button>
							<button
								type="button"
								onClick={() => dispatch({ type: "dismissMemory", key: candidateKey })}
								className="px-2 py-1 text-[10px] text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
							>
								Dismiss
							</button>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function StoreSuggestionList({
	suggestions,
	state,
	dispatch,
	onStore,
}: {
	suggestions: StoredTabSetSuggestion[];
	state: ProposalState;
	dispatch: Dispatch<ProposalAction>;
	onStore: (suggestion: StoredTabSetSuggestion) => Promise<void>;
}) {
	if (suggestions.length === 0) return null;

	return (
		<div className="space-y-1.5">
			{suggestions.map((suggestion) => {
				const suggestionKey = storeSuggestionKey(suggestion);
				if (state.dismissedStoreRows.has(suggestionKey)) return null;
				const saving = state.savingStoreRows.has(suggestionKey);
				return (
					<div
						key={suggestionKey}
						className="border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 rounded-lg px-2.5 py-2"
					>
						<div className="flex items-start justify-between gap-2">
							<div>
								<div className="text-xs font-medium text-blue-900 dark:text-blue-200">
									Store in {suggestion.setName}
								</div>
								<div className="text-[10px] text-blue-700 dark:text-blue-300">
									{suggestion.tabIds.length} tabs &middot; {suggestion.confidence} confidence
								</div>
							</div>
							<button
								type="button"
								disabled={saving}
								onClick={async () => {
									dispatch({ type: "savingStore", key: suggestionKey, saving: true });
									try {
										await onStore(suggestion);
										dispatch({ type: "dismissStore", key: suggestionKey });
									} catch (error) {
										console.warn("[stored] Failed to store suggestion:", error);
									} finally {
										dispatch({ type: "savingStore", key: suggestionKey, saving: false });
									}
								}}
								className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
							>
								{saving ? "Storing..." : "Store & close"}
							</button>
						</div>
						<div className="mt-1.5 text-xs text-blue-800 dark:text-blue-200">
							{suggestion.reason}
						</div>
						<button
							type="button"
							onClick={() => dispatch({ type: "dismissStore", key: suggestionKey })}
							className="mt-1 text-[10px] text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
						>
							Dismiss
						</button>
					</div>
				);
			})}
		</div>
	);
}

function StatusLegend() {
	return (
		<div className="flex gap-3 text-[10px] text-gray-400 dark:text-gray-500">
			<span className="flex items-center gap-1">
				<span className="size-2 rounded-full bg-green-400" />
				Not moved
			</span>
			<span className="flex items-center gap-1">
				<span className="size-2 rounded-full bg-yellow-400" />
				Moved
			</span>
			<span className="flex items-center gap-1">
				<span className="size-2 rounded-full bg-purple-400" />
				From ungrouped
			</span>
		</div>
	);
}

function ProposalTabRow({
	tab,
	led,
	selected,
	refining,
	dispatch,
	onRefine,
}: {
	tab: TabInfo;
	led: { color: string; label: string };
	selected: boolean;
	refining: boolean;
	dispatch: Dispatch<ProposalAction>;
	onRefine: (feedback: string, targetGroupName?: string, targetTabId?: number) => void;
}) {
	return (
		<div>
			<button
				type="button"
				onClick={() => dispatch({ type: "toggleTab", tabId: tab.id })}
				className="w-full flex items-center gap-2 py-1.5 px-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
			>
				<span className={`size-2 rounded-full flex-shrink-0 ${led.color}`} title={led.label} />
				<Favicon url={tab.favIconUrl} pageUrl={tab.url} className="size-4 flex-shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="text-xs text-gray-800 dark:text-gray-200 truncate">{tab.title}</div>
					<div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
						{domain(tab.url)}
					</div>
				</div>
			</button>
			{selected && (
				<div className="px-3 pb-1.5">
					<FeedbackInput
						placeholder="Feedback on this tab... (Enter to send)"
						disabled={refining}
						onSubmit={(text) => onRefine(text, undefined, tab.id)}
					/>
				</div>
			)}
		</div>
	);
}

function ProposalGroup({
	groupKey,
	suggestion,
	tabsById,
	originalGroupIds,
	state,
	refining,
	dispatch,
	onRefine,
}: {
	groupKey: ProposalGroupKey;
	suggestion: GroupingSuggestion;
	tabsById: Map<number, TabInfo>;
	originalGroupIds: Map<number, number>;
	state: ProposalState;
	refining: boolean;
	dispatch: Dispatch<ProposalAction>;
	onRefine: (feedback: string, targetGroupName?: string, targetTabId?: number) => void;
}) {
	const isExpanded = state.expandedGroup === groupKey;

	return (
		<div
			className="rounded-lg"
			style={{ ...chromeBorderStyle(suggestion.color), ...chromeBgStyle(suggestion.color) }}
		>
			<button
				type="button"
				onClick={() => dispatch({ type: "toggleGroup", key: groupKey })}
				className="w-full flex items-center justify-between px-3 py-2 text-left"
			>
				<span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
					{suggestion.groupName}
				</span>
				<span className="text-xs text-gray-500 dark:text-gray-400">
					{suggestion.tabIds.length} tabs {suggestion.isNew ? "" : "(existing) "}
					{isExpanded ? "\u2212" : "+"}
				</span>
			</button>

			{isExpanded && (
				<div className="px-3 pb-1.5">
					{suggestion.rationale && (
						<p className="mb-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
							{suggestion.basis ? `${suggestion.basis}: ` : ""}
							{suggestion.rationale}
						</p>
					)}
					<FeedbackInput
						placeholder={`Feedback on "${suggestion.groupName}"... (Enter to send)`}
						disabled={refining}
						onSubmit={(text) => onRefine(text, suggestion.groupName)}
					/>
				</div>
			)}

			{isExpanded && (
				<div className="pb-2">
					{suggestion.tabIds.map((tabId) => {
						const tab = tabsById.get(tabId);
						if (!tab) return null;
						const status = getTabStatus(tabId, suggestion, originalGroupIds);
						return (
							<ProposalTabRow
								key={tabId}
								tab={tab}
								led={STATUS_LED[status]}
								selected={state.selectedTab === tabId}
								refining={refining}
								dispatch={dispatch}
								onRefine={onRefine}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

function UngroupedProposalTabs({
	tabs,
	reasons,
	expanded,
	dispatch,
}: {
	tabs: TabInfo[];
	reasons: Map<number, string>;
	expanded: boolean;
	dispatch: Dispatch<ProposalAction>;
}) {
	if (tabs.length === 0) return null;

	return (
		<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
			<button
				type="button"
				onClick={() => dispatch({ type: "toggleGroup", key: "__ungrouped__" })}
				className="w-full flex items-center justify-between px-3 py-2 text-left"
			>
				<span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Ungrouped</span>
				<span className="text-xs text-gray-400 dark:text-gray-500">
					{tabs.length} tabs {expanded ? "\u2212" : "+"}
				</span>
			</button>
			{expanded && (
				<div className="pb-2">
					{tabs.map((tab) => (
						<div key={tab.id} className="flex items-center gap-2 py-1.5 px-3">
							<span className="size-2 rounded-full flex-shrink-0 bg-gray-300 dark:bg-gray-600" />
							<Favicon url={tab.favIconUrl} pageUrl={tab.url} className="size-4 flex-shrink-0" />
							<div className="min-w-0 flex-1">
								<div className="text-xs text-gray-600 dark:text-gray-400 truncate">{tab.title}</div>
								<div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
									{domain(tab.url)}
								</div>
								{reasons.get(tab.id) && (
									<div className="mt-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
										{reasons.get(tab.id)}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function ProposalActions({
	refining,
	testMode,
	suggestions,
	onApply,
	onDismiss,
}: {
	refining: boolean;
	testMode: boolean;
	suggestions: GroupingSuggestion[];
	onApply: (suggestions: GroupingSuggestion[]) => void;
	onDismiss: () => void;
}) {
	return (
		<div className="flex gap-2 pt-2 sticky bottom-0 bg-gray-50 dark:bg-gray-900 pb-2">
			<button
				type="button"
				onClick={onDismiss}
				disabled={refining}
				className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
			>
				Cancel
			</button>
			<button
				type="button"
				onClick={() => onApply(suggestions)}
				disabled={refining || testMode}
				className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
			>
				{testMode ? "Apply (disabled in test)" : "Apply"}
			</button>
		</div>
	);
}

export function ProposalView({
	suggestions,
	reasoning,
	tabs,
	originalGroupIds,
	refining,
	testMode,
	memoryCandidates,
	storeSuggestions,
	ungrouped,
	onRefine,
	onApply,
	onSaveMemoryCandidate,
	onStoreSuggestion,
	onDismiss,
}: ProposalViewProps) {
	const [state, dispatch] = useReducer(proposalReducer, undefined, createProposalState);
	const tabsById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
	const ungroupedReasons = useMemo(
		() => new Map(ungrouped.map((entry) => [entry.tabId, entry.reason])),
		[ungrouped],
	);
	const ungroupedTabs = useMemo(() => {
		const groupedTabIds = new Set<number>();
		for (const suggestion of suggestions) {
			for (const tabId of suggestion.tabIds) groupedTabIds.add(tabId);
		}
		const result: TabInfo[] = [];
		for (const tab of tabs) {
			if (!groupedTabIds.has(tab.id)) result.push(tab);
		}
		return result;
	}, [suggestions, tabs]);

	return (
		<div className="space-y-2">
			<ProposalHeader refining={refining} />
			<p className="text-xs text-gray-500 dark:text-gray-400 italic">{reasoning}</p>

			<MemoryCandidateList
				candidates={memoryCandidates}
				state={state}
				dispatch={dispatch}
				onSave={onSaveMemoryCandidate}
			/>
			<StoreSuggestionList
				suggestions={storeSuggestions}
				state={state}
				dispatch={dispatch}
				onStore={onStoreSuggestion}
			/>
			<StatusLegend />

			{suggestions.map((suggestion, idx) => (
				<ProposalGroup
					key={suggestion.tabIds[0] ?? idx}
					groupKey={suggestion.tabIds[0] ?? idx}
					suggestion={suggestion}
					tabsById={tabsById}
					originalGroupIds={originalGroupIds}
					state={state}
					refining={refining}
					dispatch={dispatch}
					onRefine={onRefine}
				/>
			))}

			<UngroupedProposalTabs
				tabs={ungroupedTabs}
				reasons={ungroupedReasons}
				expanded={state.expandedGroup === "__ungrouped__"}
				dispatch={dispatch}
			/>
			<ProposalActions
				refining={refining}
				testMode={testMode}
				suggestions={suggestions}
				onApply={onApply}
				onDismiss={onDismiss}
			/>
		</div>
	);
}
