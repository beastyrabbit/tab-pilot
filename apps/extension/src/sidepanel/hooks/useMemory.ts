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

	return { memories, loading, remove, clearAll, refresh };
}
