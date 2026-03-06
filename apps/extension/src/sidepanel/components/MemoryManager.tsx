import type { AIMemory } from "@tab-orga/shared";

interface MemoryManagerProps {
	memories: AIMemory[];
	onDelete: (id: string) => void;
	onClearAll: () => void;
	onClose: () => void;
}

export function MemoryManager({ memories, onDelete, onClearAll, onClose }: MemoryManagerProps) {
	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[380px] max-h-[90vh] overflow-y-auto">
				<div className="p-3 border-b dark:border-gray-700 flex items-center justify-between">
					<h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">AI Memory</h2>
					<div className="flex items-center gap-2">
						{memories.length > 0 && (
							<button
								type="button"
								onClick={onClearAll}
								className="text-[10px] text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
							>
								Clear all
							</button>
						)}
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
				</div>

				<div className="p-2">
					{memories.length === 0 ? (
						<p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
							No memories yet. Memories are created when you modify AI suggestions.
						</p>
					) : (
						<div className="space-y-1">
							{memories.map((memory) => (
								<div
									key={memory.id}
									className="flex items-start gap-2 p-2 rounded bg-white dark:bg-gray-800 text-xs"
								>
									<div className="flex-1">
										<div className="text-gray-800 dark:text-gray-200">{memory.observation}</div>
										<div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
											{memory.source} &middot; {new Date(memory.createdAt).toLocaleDateString()}
										</div>
									</div>
									<button
										type="button"
										onClick={() => onDelete(memory.id)}
										className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-0.5 flex-shrink-0"
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
