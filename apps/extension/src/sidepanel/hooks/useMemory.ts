import type { AIMemory } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";

const KEY = "tab-orga-memories";

export function useMemory() {
	const [memories, setMemories] = useState<AIMemory[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const result = await chrome.storage.local.get(KEY);
			setMemories((result[KEY] as AIMemory[] | undefined) || []);
		} catch {
			// Server might be offline
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const update = useCallback(
		async (id: string, observation: string) => {
			const result = await chrome.storage.local.get(KEY);
			const next = ((result[KEY] as AIMemory[] | undefined) || []).map((m) =>
				m.id === id ? { ...m, observation } : m,
			);
			await chrome.storage.local.set({ [KEY]: next });
			refresh();
		},
		[refresh],
	);

	const add = useCallback(
		async (observation: string) => {
			const result = await chrome.storage.local.get(KEY);
			const next = [
				...((result[KEY] as AIMemory[] | undefined) || []),
				{
					id: crypto.randomUUID(),
					observation,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];
			await chrome.storage.local.set({ [KEY]: next });
			refresh();
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			const result = await chrome.storage.local.get(KEY);
			await chrome.storage.local.set({
				[KEY]: ((result[KEY] as AIMemory[] | undefined) || []).filter((m) => m.id !== id),
			});
			refresh();
		},
		[refresh],
	);

	const clearAll = useCallback(async () => {
		await chrome.storage.local.set({ [KEY]: [] });
		refresh();
	}, [refresh]);

	const aiEdit = useCallback(async (instruction: string) => {
		return `Memories are stored locally. Edit them directly to apply: ${instruction}`;
	}, []);

	return { memories, loading, add, update, remove, clearAll, aiEdit, refresh };
}
