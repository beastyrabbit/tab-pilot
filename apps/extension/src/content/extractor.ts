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
		const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || "";
		const headings = [...document.querySelectorAll("h1, h2")]
			.map((heading) => (heading.textContent || "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.slice(0, 10);
		const source = document.querySelector("main, article, [role='main']") || document.body;
		const cleaned = source?.cloneNode(true) as HTMLElement | undefined;
		cleaned?.querySelectorAll("script, style, noscript, nav, footer, aside").forEach((element) => {
			element.remove();
		});
		const mainText = (cleaned?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 5_500);
		result.pageText = [
			canonical ? `Canonical URL: ${canonical}` : "",
			headings.length > 0 ? `Headings: ${headings.join(" | ")}` : "",
			mainText ? `Main text: ${mainText}` : "",
		]
			.filter(Boolean)
			.join("\n")
			.slice(0, 6_000);
	}

	return result;
}

// This script is injected on-demand via chrome.scripting.executeScript
// The return value is captured by the caller
extractContent((globalThis as Record<string, unknown>).__TAB_ORGA_FULL_TEXT__ === true);
