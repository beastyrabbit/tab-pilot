import type { StoredTabSetSummary } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";
import { restoreStoredTabSet } from "../services/chromeTabsApi.js";
import { serverApi } from "../services/serverApi.js";

interface StoredSetsManagerProps {
	onClose: () => void;
	onRestored: () => void;
}

export function StoredSetsManager({ onClose, onRestored }: StoredSetsManagerProps) {
	const [sets, setSets] = useState<StoredTabSetSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [workingId, setWorkingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await serverApi.listStoredSets();
			setSets(result.sets);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Failed to load stored sets");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleRestore = async (id: string) => {
		setWorkingId(id);
		setError(null);
		try {
			const { set } = await serverApi.restoreStoredSet(id);
			await restoreStoredTabSet(set);
			onRestored();
			onClose();
		} catch (restoreError) {
			setError(restoreError instanceof Error ? restoreError.message : "Failed to restore set");
		} finally {
			setWorkingId(null);
		}
	};

	const handleDelete = async (id: string, name: string) => {
		if (!window.confirm(`Delete stored set "${name}"?`)) return;
		setWorkingId(id);
		setError(null);
		try {
			await serverApi.deleteStoredSet(id);
			await refresh();
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : "Failed to delete set");
		} finally {
			setWorkingId(null);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-3 max-h-[90vh] overflow-y-auto p-4">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Stored Sets</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
						aria-label="Close stored sets"
					>
						<svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{loading ? (
					<div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
						Loading stored sets&hellip;
					</div>
				) : sets.length === 0 ? (
					<div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
						No stored sets
					</div>
				) : (
					<div className="space-y-2">
						{sets.map((set) => (
							<div
								key={set.id}
								className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
											{set.name}
										</div>
										<div className="text-[10px] text-gray-400 dark:text-gray-500">
											{set.tabCount} tabs
											{set.domains.length > 0 ? ` · ${set.domains.slice(0, 3).join(", ")}` : ""}
										</div>
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											disabled={workingId !== null}
											onClick={() => handleRestore(set.id)}
											className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
										>
											Restore
										</button>
										<button
											type="button"
											disabled={workingId !== null}
											onClick={() => handleDelete(set.id, set.name)}
											className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
											aria-label={`Delete ${set.name}`}
										>
											<svg
												className="size-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M6 7h12M9 7V5h6v2m-8 0l1 12h8l1-12"
												/>
											</svg>
										</button>
									</div>
								</div>
								<p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
									{set.summary}
								</p>
							</div>
						))}
					</div>
				)}

				{error && <div className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</div>}
			</div>
		</div>
	);
}
