import type { TabInfo } from "@tab-orga/shared";

interface ExtractedContent {
	metaDescription: string | null;
	ogDescription: string | null;
	keywords: string | null;
	pageText: string | null;
}

export async function extractTabContent(
	tabId: number,
	includeFullText: boolean,
): Promise<ExtractedContent | null> {
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: (fullText: boolean) => {
				const getMeta = (name: string): string | null => {
					const el =
						document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`) ||
						document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`);
					return el?.content || null;
				};

				return {
					metaDescription: getMeta("description"),
					ogDescription: getMeta("og:description"),
					keywords: getMeta("keywords"),
					pageText: fullText ? (document.body?.innerText || "").slice(0, 2000) : null,
				};
			},
			args: [includeFullText],
		});
		return results?.[0]?.result || null;
	} catch {
		return null;
	}
}

export async function enrichTabsWithContent(
	tabs: TabInfo[],
	contentDepth: "title-url" | "meta" | "full",
): Promise<TabInfo[]> {
	if (contentDepth === "title-url") return tabs;

	const includeFullText = contentDepth === "full";
	const enriched = await Promise.all(
		tabs.map(async (tab) => {
			// Skip chrome://, about:, extension pages
			if (!tab.url.startsWith("http")) return tab;

			const content = await extractTabContent(tab.id, includeFullText);
			if (!content) return tab;

			return {
				...tab,
				metaDescription: content.metaDescription || content.ogDescription || undefined,
				pageText: content.pageText || undefined,
			};
		}),
	);

	return enriched;
}
