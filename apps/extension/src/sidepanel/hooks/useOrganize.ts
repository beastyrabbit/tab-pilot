import type { ContentDepth, GroupingSuggestion, TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useCallback, useState } from "react";
import { enrichTabsWithContent } from "../services/chromeContentApi.js";
import { groupTabs, updateGroup } from "../services/chromeTabsApi.js";
import { serverApi } from "../services/serverApi.js";

export function useOrganize() {
	const [suggestions, setSuggestions] = useState<GroupingSuggestion[] | null>(null);
	const [reasoning, setReasoning] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const organize = useCallback(
		async (tabs: TabInfo[], groups: TabGroupInfo[], contentDepth: ContentDepth = "title-url") => {
			setLoading(true);
			setError(null);
			try {
				const enrichedTabs = await enrichTabsWithContent(tabs, contentDepth);
				const result = await serverApi.organize({
					tabs: enrichedTabs,
					existingGroups: groups,
					contentDepth,
				});
				setSuggestions(result.suggestions);
				setReasoning(result.reasoning);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to organize");
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	const applySuggestions = useCallback(
		async (toApply: GroupingSuggestion[], tabs: TabInfo[]) => {
			try {
				for (const suggestion of toApply) {
					if (suggestion.tabIds.length === 0) continue;

					let gid: number;
					if (suggestion.existingGroupId !== undefined) {
						gid = await groupTabs(suggestion.tabIds, suggestion.existingGroupId);
					} else {
						gid = await groupTabs(suggestion.tabIds);
					}

					await updateGroup(gid, {
						title: suggestion.groupName,
						color: suggestion.color as chrome.tabGroups.ColorEnum,
					});
				}

				// Fire-and-forget learning
				if (suggestions) {
					serverApi
						.learn({
							originalSuggestions: suggestions,
							appliedSuggestions: toApply,
							tabs,
						})
						.catch(() => {});
				}

				setSuggestions(null);
				setReasoning("");
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to apply groups");
			}
		},
		[suggestions],
	);

	const dismiss = useCallback(() => {
		setSuggestions(null);
		setReasoning("");
	}, []);

	return { suggestions, reasoning, loading, error, organize, applySuggestions, dismiss };
}
