import type { GroupingSuggestion, TabInfo } from "@tab-orga/shared";
import { useState } from "react";
import { chromeBgStyle, chromeBorderStyle } from "../utils/chromeColors.js";

interface ProposalViewProps {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	tabs: TabInfo[];
	originalGroupIds: Map<number, number>;
	refining: boolean;
	testMode: boolean;
	onRefine: (feedback: string, targetGroupName?: string, targetTabId?: number) => void;
	onApply: (suggestions: GroupingSuggestion[]) => void;
	onDismiss: () => void;
}

type TabStatus = "unchanged" | "moved" | "newly-grouped";

function getTabStatus(
	tabId: number,
	suggestion: GroupingSuggestion,
	originalGroupIds: Map<number, number>,
): TabStatus {
	const originalGroup = originalGroupIds.get(tabId);
	if (originalGroup === undefined || originalGroup === -1) {
		return "newly-grouped";
	}
	if (suggestion.existingGroupId != null && suggestion.existingGroupId === originalGroup) {
		return "unchanged";
	}
	return "moved";
}

const STATUS_LED: Record<TabStatus, { color: string; label: string }> = {
	unchanged: { color: "bg-green-400", label: "Not moved" },
	moved: { color: "bg-yellow-400", label: "Moved" },
	"newly-grouped": { color: "bg-purple-400", label: "From ungrouped" },
};

function Favicon({
	url,
	pageUrl,
	className,
}: { url?: string; pageUrl?: string; className?: string }) {
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
}: { placeholder: string; disabled: boolean; onSubmit: (text: string) => void }) {
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
			value={text}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={disabled ? "Refining..." : placeholder}
			disabled={disabled}
			className="w-full mt-1.5 px-2.5 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
		/>
	);
}

export function ProposalView({
	suggestions,
	reasoning,
	tabs,
	originalGroupIds,
	refining,
	testMode,
	onRefine,
	onApply,
	onDismiss,
}: ProposalViewProps) {
	const [expandedGroup, setExpandedGroup] = useState<number | string | null>(null);
	const [selectedTab, setSelectedTab] = useState<number | null>(null);

	const findTab = (id: number) => tabs.find((t) => t.id === id);

	const domain = (url: string) => {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	};

	return (
		<div className="space-y-2">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Proposed Groups</h2>
				{refining && (
					<span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
						<span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
						Refining...
					</span>
				)}
			</div>

			{/* Reasoning */}
			<p className="text-xs text-gray-500 dark:text-gray-400 italic">{reasoning}</p>

			{/* LED legend */}
			<div className="flex gap-3 text-[10px] text-gray-400 dark:text-gray-500">
				<span className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-green-400" />
					Not moved
				</span>
				<span className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-yellow-400" />
					Moved
				</span>
				<span className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-purple-400" />
					From ungrouped
				</span>
			</div>

			{/* Groups */}
			{suggestions.map((suggestion, idx) => {
				const stableKey = suggestion.tabIds[0] ?? idx;
				const isExpanded = expandedGroup === stableKey;

				return (
					<div
						key={stableKey}
						className="border-l-2 rounded-r-lg"
						style={{ ...chromeBorderStyle(suggestion.color), ...chromeBgStyle(suggestion.color) }}
					>
						{/* Group header */}
						<button
							type="button"
							onClick={() => setExpandedGroup(isExpanded ? null : stableKey)}
							className="w-full flex items-center justify-between px-3 py-2 text-left"
						>
							<span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
								{suggestion.groupName}
							</span>
							<span className="text-xs text-gray-500 dark:text-gray-400">
								{suggestion.tabIds.length} tabs {suggestion.isNew ? "" : "(existing) "}
								{isExpanded ? "−" : "+"}
							</span>
						</button>

						{/* Group feedback input */}
						{isExpanded && (
							<div className="px-3 pb-1.5">
								<FeedbackInput
									placeholder={`Feedback on "${suggestion.groupName}"... (Enter to send)`}
									disabled={refining}
									onSubmit={(text) => onRefine(text, suggestion.groupName)}
								/>
							</div>
						)}

						{/* Tabs */}
						{isExpanded && (
							<div className="pb-2">
								{suggestion.tabIds.map((tabId) => {
									const tab = findTab(tabId);
									if (!tab) return null;
									const status = getTabStatus(tabId, suggestion, originalGroupIds);
									const led = STATUS_LED[status];
									const isSelected = selectedTab === tabId;

									return (
										<div key={tabId}>
											<button
												type="button"
												onClick={() => setSelectedTab(isSelected ? null : tabId)}
												className="w-full flex items-center gap-2 py-1.5 px-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
											>
												{/* LED */}
												<span
													className={`w-2 h-2 rounded-full flex-shrink-0 ${led.color}`}
													title={led.label}
												/>
												{/* Favicon */}
												<Favicon
													url={tab.favIconUrl}
													pageUrl={tab.url}
													className="w-4 h-4 flex-shrink-0"
												/>
												{/* Title + domain */}
												<div className="min-w-0 flex-1">
													<div className="text-xs text-gray-800 dark:text-gray-200 truncate">
														{tab.title}
													</div>
													<div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
														{domain(tab.url)}
													</div>
												</div>
											</button>
											{/* Tab feedback input */}
											{isSelected && (
												<div className="px-3 pb-1.5">
													<FeedbackInput
														placeholder="Feedback on this tab... (Enter to send)"
														disabled={refining}
														onSubmit={(text) => onRefine(text, undefined, tabId)}
													/>
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</div>
				);
			})}

			{/* Ungrouped tabs */}
			{(() => {
				const groupedTabIds = new Set(suggestions.flatMap((s) => s.tabIds));
				const ungroupedTabs = tabs.filter((t) => !groupedTabIds.has(t.id));
				if (ungroupedTabs.length === 0) return null;

				const isExpanded = expandedGroup === "__ungrouped__";
				return (
					<div className="border-l-2 rounded-r-lg border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
						<button
							type="button"
							onClick={() => setExpandedGroup(isExpanded ? null : "__ungrouped__")}
							className="w-full flex items-center justify-between px-3 py-2 text-left"
						>
							<span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
								Ungrouped
							</span>
							<span className="text-xs text-gray-400 dark:text-gray-500">
								{ungroupedTabs.length} tabs {isExpanded ? "\u2212" : "+"}
							</span>
						</button>
						{isExpanded && (
							<div className="pb-2">
								{ungroupedTabs.map((tab) => (
									<div key={tab.id} className="flex items-center gap-2 py-1.5 px-3">
										<span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300 dark:bg-gray-600" />
										<Favicon
											url={tab.favIconUrl}
											pageUrl={tab.url}
											className="w-4 h-4 flex-shrink-0"
										/>
										<div className="min-w-0 flex-1">
											<div className="text-xs text-gray-600 dark:text-gray-400 truncate">
												{tab.title}
											</div>
											<div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
												{domain(tab.url)}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				);
			})()}

			{/* Actions */}
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
		</div>
	);
}
