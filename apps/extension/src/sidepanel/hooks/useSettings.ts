import type { PublicSettings } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";

const SETTINGS_KEY = "tab-orga-settings";
const DEFAULT_SETTINGS: PublicSettings = {
	provider: "cliproxy",
	model: "gpt-5.3-codex",
	contentDepth: "meta",
	generalPrompt: "",
	organizationThinking: "low",
	summaryThinking: "medium",
	serviceTier: "default",
	groupTitleLength: "medium",
	groupingMode: "soft",
	preserveExistingGroups: true,
	allowRenameGroups: false,
	allowComplexTitles: false,
	allowAddToExistingGroups: true,
	keepUngroupedTabs: true,
	closeDuplicateTabs: false,
	keepNewestDuplicate: true,
	proxyUrl: "http://127.0.0.1:8317/v1",
	proxyApiKey: "",
};

/** Stored settings merged over defaults, so older or missing settings never leave fields undefined. */
export async function loadSettings(): Promise<PublicSettings> {
	const stored = await chrome.storage.local.get(SETTINGS_KEY);
	return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<PublicSettings> | undefined) };
}

export function useSettings() {
	const [settings, setSettings] = useState<PublicSettings | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const stored = await chrome.storage.local.get(SETTINGS_KEY);
			const s = stored[SETTINGS_KEY] as PublicSettings | undefined;
			setSettings(s || DEFAULT_SETTINGS);
		} catch {
			// Server might be offline
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const update = useCallback(async (partial: Partial<PublicSettings>) => {
		const stored = await chrome.storage.local.get(SETTINGS_KEY);
		const s = {
			...DEFAULT_SETTINGS,
			...(stored[SETTINGS_KEY] as PublicSettings | undefined),
			...partial,
		} as PublicSettings;
		await chrome.storage.local.set({ [SETTINGS_KEY]: s });
		setSettings(s);
		return s;
	}, []);

	return { settings, loading, update, refresh };
}
