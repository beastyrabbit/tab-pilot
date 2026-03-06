import type { RuleMatchType, UserRule } from "@tab-orga/shared";
import { useState } from "react";

interface RuleEditorProps {
	rules: UserRule[];
	onCreate: (rule: Omit<UserRule, "id" | "createdAt">) => void;
	onUpdate: (id: string, updates: Partial<UserRule>) => void;
	onDelete: (id: string) => void;
	onClose: () => void;
}

export function RuleEditor({ rules, onCreate, onUpdate, onDelete, onClose }: RuleEditorProps) {
	const [pattern, setPattern] = useState("");
	const [matchType, setMatchType] = useState<RuleMatchType>("domain");
	const [targetGroup, setTargetGroup] = useState("");

	const handleAdd = () => {
		if (!pattern.trim() || !targetGroup.trim()) return;
		onCreate({
			pattern: pattern.trim(),
			matchType,
			targetGroup: targetGroup.trim(),
			enabled: true,
		});
		setPattern("");
		setTargetGroup("");
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[380px] max-h-[90vh] overflow-y-auto">
				<div className="p-3 border-b dark:border-gray-700 flex items-center justify-between">
					<h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Rules</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Add new rule */}
				<div className="p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 space-y-2">
					<div className="flex gap-2">
						<select
							value={matchType}
							onChange={(e) => setMatchType(e.target.value as RuleMatchType)}
							className="text-[10px] border rounded px-1.5 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							<option value="domain">Domain</option>
							<option value="url-contains">URL contains</option>
							<option value="title-contains">Title contains</option>
							<option value="regex">Regex</option>
						</select>
						<input
							type="text"
							value={pattern}
							onChange={(e) => setPattern(e.target.value)}
							placeholder="Pattern..."
							className="flex-1 text-xs border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
						/>
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={targetGroup}
							onChange={(e) => setTargetGroup(e.target.value)}
							placeholder="Target group name..."
							className="flex-1 text-xs border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
						/>
						<button
							type="button"
							onClick={handleAdd}
							disabled={!pattern.trim() || !targetGroup.trim()}
							className="text-[10px] px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
						>
							Add
						</button>
					</div>
				</div>

				{/* Rule list */}
				<div className="p-2">
					{rules.length === 0 ? (
						<p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
							No rules yet. Add one above.
						</p>
					) : (
						<div className="space-y-1">
							{rules.map((rule) => (
								<div
									key={rule.id}
									className={`flex items-center gap-2 p-2 rounded text-xs ${rule.enabled ? "bg-white dark:bg-gray-800" : "bg-gray-100 dark:bg-gray-900/50 opacity-60"}`}
								>
									<input
										type="checkbox"
										checked={rule.enabled}
										onChange={() => onUpdate(rule.id, { enabled: !rule.enabled })}
										className="rounded"
									/>
									<div className="flex-1 min-w-0">
										<div className="font-medium text-gray-800 dark:text-gray-200 truncate">
											{rule.matchType}: "{rule.pattern}"
										</div>
										<div className="text-[10px] text-gray-500 dark:text-gray-400">
											→ {rule.targetGroup}
										</div>
									</div>
									<button
										type="button"
										onClick={() => onDelete(rule.id)}
										className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-0.5"
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
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
