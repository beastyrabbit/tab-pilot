import type { UserRule } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";

const KEY = "tab-orga-rules";

export function useRules() {
	const [rules, setRules] = useState<UserRule[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const result = await chrome.storage.local.get(KEY);
			setRules((result[KEY] as UserRule[] | undefined) || []);
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
			const next = [
				...rulesFromStorage(await chrome.storage.local.get(KEY)),
				{ ...rule, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
			];
			await chrome.storage.local.set({ [KEY]: next });
			refresh();
		},
		[refresh],
	);

	const update = useCallback(
		async (id: string, updates: Partial<UserRule>) => {
			const next = rulesFromStorage(await chrome.storage.local.get(KEY)).map((r) =>
				r.id === id ? { ...r, ...updates } : r,
			);
			await chrome.storage.local.set({ [KEY]: next });
			refresh();
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			const next = rulesFromStorage(await chrome.storage.local.get(KEY)).filter((r) => r.id !== id);
			await chrome.storage.local.set({ [KEY]: next });
			refresh();
		},
		[refresh],
	);

	return { rules, loading, create, update, remove, refresh };
}

function rulesFromStorage(value: { [KEY]: unknown }): UserRule[] {
	return Array.isArray(value[KEY]) ? (value[KEY] as UserRule[]) : [];
}
