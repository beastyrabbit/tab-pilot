import type { AIMemory } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

export function useMemory() {
	const [memories, setMemories] = useState<AIMemory[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			setMemories(await serverApi.getMemories());
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
			await serverApi.updateMemory(id, observation);
			refresh();
		},
		[refresh],
	);

	const add = useCallback(
		async (observation: string) => {
			await serverApi.createMemory(observation);
			refresh();
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			await serverApi.deleteMemory(id);
			refresh();
		},
		[refresh],
	);

	const clearAll = useCallback(async () => {
		await serverApi.clearMemories();
		refresh();
	}, [refresh]);

	const aiEdit = useCallback(
		async (instruction: string) => {
			const result = await serverApi.aiEditMemories(instruction);
			refresh();
			return result.summary;
		},
		[refresh],
	);

	return { memories, loading, add, update, remove, clearAll, aiEdit, refresh };
}
