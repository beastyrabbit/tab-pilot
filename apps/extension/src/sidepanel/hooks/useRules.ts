import type { UserRule } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

export function useRules() {
	const [rules, setRules] = useState<UserRule[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			setRules(await serverApi.getRules());
		} catch {
			// Server might be offline
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const create = useCallback(
		async (rule: Omit<UserRule, "id" | "createdAt">) => {
			await serverApi.createRule(rule);
			refresh();
		},
		[refresh],
	);

	const update = useCallback(
		async (id: string, updates: Partial<UserRule>) => {
			await serverApi.updateRule(id, updates);
			refresh();
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			await serverApi.deleteRule(id);
			refresh();
		},
		[refresh],
	);

	return { rules, loading, create, update, remove, refresh };
}
