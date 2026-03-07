interface ExtractedContent {
	metaDescription: string | null;
	ogDescription: string | null;
	keywords: string | null;
	pageText: string | null;
}

function extractContent(includeFullText: boolean): ExtractedContent {
	const getMeta = (name: string): string | null => {
		const el =
			document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`) ||
			document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`);
		return el?.content || null;
	};

	const result: ExtractedContent = {
		metaDescription: getMeta("description"),
		ogDescription: getMeta("og:description"),
		keywords: getMeta("keywords"),
		pageText: null,
	};

	if (includeFullText) {
		const body = document.body?.innerText || "";
		result.pageText = body.slice(0, 100_000);
	}

	return result;
}

// This script is injected on-demand via chrome.scripting.executeScript
// The return value is captured by the caller
extractContent((globalThis as Record<string, unknown>).__TAB_ORGA_FULL_TEXT__ === true);
