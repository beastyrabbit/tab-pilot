import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useCallback, useEffect, useState } from "react";
import { getAllGroups, getAllTabs } from "../services/chromeTabsApi.js";

export function useTabs() {
	const [tabs, setTabs] = useState<TabInfo[]>([]);
	const [groups, setGroups] = useState<TabGroupInfo[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const [fetchedTabs, fetchedGroups] = await Promise.all([getAllTabs(), getAllGroups()]);
			setTabs(fetchedTabs);
			setGroups(fetchedGroups);
		} catch (e) {
			console.error("Failed to fetch tabs:", e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();

		const onUpdated = () => refresh();
		const onRemoved = () => refresh();
		const onMoved = () => refresh();

		chrome.tabs.onUpdated.addListener(onUpdated);
		chrome.tabs.onRemoved.addListener(onRemoved);
		chrome.tabs.onMoved.addListener(onMoved);

		return () => {
			chrome.tabs.onUpdated.removeListener(onUpdated);
			chrome.tabs.onRemoved.removeListener(onRemoved);
			chrome.tabs.onMoved.removeListener(onMoved);
		};
	}, [refresh]);

	return { tabs, groups, loading, refresh };
}
