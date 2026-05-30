import type { TabInfo } from "@tab-orga/shared";

export interface ExtractedContent {
	metaDescription: string | null;
	ogDescription: string | null;
	keywords: string | null;
	pageText: string | null;
}

const METADATA_EXTRACTION_TIMEOUT_MS = 1_500;
const FULL_TEXT_EXTRACTION_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(`${label} timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}

export async function extractTabContent(
	tabId: number,
	includeFullText: boolean,
): Promise<ExtractedContent | null> {
	try {
		const results = await withTimeout(
			chrome.scripting.executeScript({
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
						pageText: fullText ? (document.body?.innerText || "").slice(0, 100_000) : null,
					};
				},
				args: [includeFullText],
			}),
			includeFullText ? FULL_TEXT_EXTRACTION_TIMEOUT_MS : METADATA_EXTRACTION_TIMEOUT_MS,
			`Content extraction for tab ${tabId}`,
		);
		return results?.[0]?.result || null;
	} catch (error) {
		console.warn(`[content] Skipping tab ${tabId}:`, error);
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
