import type { GroupingSuggestion, TabInfo } from "@tab-orga/shared";
import { useState } from "react";

interface GroupProposalProps {
	suggestions: GroupingSuggestion[];
	reasoning: string;
	tabs: TabInfo[];
	onApply: (suggestions: GroupingSuggestion[]) => void;
	onDismiss: () => void;
}

const COLOR_BG: Record<string, string> = {
	grey: "bg-gray-100 border-gray-400",
	blue: "bg-blue-50 border-blue-400",
	red: "bg-red-50 border-red-400",
	yellow: "bg-yellow-50 border-yellow-400",
	green: "bg-green-50 border-green-400",
	pink: "bg-pink-50 border-pink-400",
	purple: "bg-purple-50 border-purple-400",
	cyan: "bg-cyan-50 border-cyan-400",
	orange: "bg-orange-50 border-orange-400",
};

export function GroupProposal({
	suggestions,
	reasoning,
	tabs,
	onApply,
	onDismiss,
}: GroupProposalProps) {
	const [enabled, setEnabled] = useState<Record<number, boolean>>(
		Object.fromEntries(suggestions.map((_, i) => [i, true])),
	);

	const toggleSuggestion = (index: number) => {
		setEnabled((prev) => ({ ...prev, [index]: !prev[index] }));
	};

	const handleApply = () => {
		const toApply = suggestions.filter((_, i) => enabled[i]);
		onApply(toApply);
	};

	const findTab = (id: number) => tabs.find((t) => t.id === id);

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white rounded-xl shadow-xl w-[380px] max-h-[90vh] overflow-y-auto">
				<div className="p-3 border-b">
					<h2 className="text-sm font-bold text-gray-900">Suggested Groups</h2>
					<p className="text-[10px] text-gray-500 mt-0.5">{reasoning}</p>
				</div>

				<div className="p-2 space-y-2">
					{suggestions.map((suggestion, index) => (
						<div
							key={`${suggestion.groupName}-${index}`}
							className={`border-l-2 rounded-r-lg p-2 ${COLOR_BG[suggestion.color] || COLOR_BG.grey} ${
								!enabled[index] ? "opacity-40" : ""
							}`}
						>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={enabled[index]}
									onChange={() => toggleSuggestion(index)}
									className="rounded"
								/>
								<span className="text-xs font-semibold text-gray-800">{suggestion.groupName}</span>
								<span className="text-[10px] text-gray-500 ml-auto">
									{suggestion.tabIds.length} tabs
									{suggestion.isNew ? "" : " (existing)"}
								</span>
							</label>
							{enabled[index] && (
								<div className="mt-1 ml-6 space-y-0.5">
									{suggestion.tabIds.map((tabId) => {
										const tab = findTab(tabId);
										return (
											<div key={tabId} className="text-[10px] text-gray-600 truncate">
												{tab?.title || `Tab ${tabId}`}
											</div>
										);
									})}
								</div>
							)}
						</div>
					))}
				</div>

				<div className="p-3 border-t flex gap-2">
					<button
						type="button"
						onClick={onDismiss}
						className="flex-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleApply}
						className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700"
					>
						Apply Selected
					</button>
				</div>
			</div>
		</div>
	);
}
