import type { PublicSettings } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

export function useSettings() {
	const [settings, setSettings] = useState<PublicSettings | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const s = await serverApi.getSettings();
			setSettings(s);
		} catch {
			// Server might be offline
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const update = useCallback(async (partial: Partial<{ model: string; contentDepth: string }>) => {
		const s = await serverApi.updateSettings(partial);
		setSettings(s);
		return s;
	}, []);

	return { settings, loading, update, refresh };
}
