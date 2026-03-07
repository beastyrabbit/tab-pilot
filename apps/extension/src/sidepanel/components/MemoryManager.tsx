import type { AIMemory } from "@tab-orga/shared";
import { useState } from "react";

interface MemoryManagerProps {
	memories: AIMemory[];
	onUpdate: (id: string, observation: string) => void;
	onDelete: (id: string) => void;
	onClearAll: () => void;
	onAIEdit: (instruction: string) => Promise<string>;
	onClose: () => void;
}

function MemoryItem({
	memory,
	onUpdate,
	onDelete,
}: {
	memory: AIMemory;
	onUpdate: (id: string, text: string) => void;
	onDelete: (id: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(memory.observation);

	const handleSave = () => {
		if (text.trim() && text.trim() !== memory.observation) {
			onUpdate(memory.id, text.trim());
		}
		setEditing(false);
	};

	return (
		<div className="flex items-start gap-2 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
			<div className="flex-1 min-w-0">
				{editing ? (
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						onBlur={handleSave}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSave();
							}
							if (e.key === "Escape") {
								setText(memory.observation);
								setEditing(false);
							}
						}}
						className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent border border-blue-400 rounded p-1 outline-none resize-none"
						rows={2}
						autoFocus
					/>
				) : (
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="text-left text-sm text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 w-full"
						title="Click to edit"
					>
						{memory.observation}
					</button>
				)}
				<div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
					{memory.source} &middot; {new Date(memory.createdAt).toLocaleDateString()}
				</div>
			</div>
			<button
				type="button"
				onClick={() => onDelete(memory.id)}
				className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-1 flex-shrink-0"
				title="Delete"
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
	);
}

export function MemoryManager({
	memories,
	onUpdate,
	onDelete,
	onClearAll,
	onAIEdit,
	onClose,
}: MemoryManagerProps) {
	const [confirmClear, setConfirmClear] = useState(false);
	const [aiInstruction, setAIInstruction] = useState("");
	const [aiWorking, setAIWorking] = useState(false);
	const [aiSummary, setAISummary] = useState<string | null>(null);

	const handleClearAll = () => {
		if (!confirmClear) {
			setConfirmClear(true);
			return;
		}
		onClearAll();
		setConfirmClear(false);
	};

	const handleAIEdit = async () => {
		if (!aiInstruction.trim() || aiWorking) return;
		setAIWorking(true);
		setAISummary(null);
		try {
			const summary = await onAIEdit(aiInstruction.trim());
			setAISummary(summary);
			setAIInstruction("");
		} catch {
			setAISummary("Failed to process instruction.");
		} finally {
			setAIWorking(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-gray-50 dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-3 max-h-[90vh] flex flex-col">
				{/* Header */}
				<div className="p-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
					<h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
						AI Memories ({memories.length})
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
					>
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* AI Edit section */}
				<div className="px-4 pt-3 pb-2 border-b dark:border-gray-700 flex-shrink-0">
					<div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
						Ask AI to edit memories
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={aiInstruction}
							onChange={(e) => setAIInstruction(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAIEdit();
							}}
							placeholder='e.g. "merge duplicates", "clean up"'
							disabled={aiWorking || memories.length === 0}
							className="flex-1 px-2.5 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
						/>
						<button
							type="button"
							onClick={handleAIEdit}
							disabled={aiWorking || !aiInstruction.trim() || memories.length === 0}
							className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
						>
							{aiWorking ? (
								<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
							) : (
								"Go"
							)}
						</button>
					</div>
					{aiSummary && (
						<p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 italic">{aiSummary}</p>
					)}
				</div>

				{/* Memory list */}
				<div className="p-3 overflow-y-auto flex-1">
					{memories.length === 0 ? (
						<p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
							No memories yet. Give feedback on tab groupings to create memories.
						</p>
					) : (
						<div className="space-y-2">
							{memories.map((memory) => (
								<MemoryItem
									key={memory.id}
									memory={memory}
									onUpdate={onUpdate}
									onDelete={onDelete}
								/>
							))}
						</div>
					)}
				</div>

				{/* Footer with Clear All */}
				{memories.length > 0 && (
					<div className="px-4 py-3 border-t dark:border-gray-700 flex-shrink-0">
						<button
							type="button"
							onClick={handleClearAll}
							onBlur={() => setConfirmClear(false)}
							className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
								confirmClear
									? "bg-red-600 text-white hover:bg-red-700"
									: "text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
							}`}
						>
							{confirmClear ? "Are you sure? Click to confirm" : "Clear all memories"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
