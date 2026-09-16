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
						pageText: fullText
							? (() => {
									const canonical =
										document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || "";
									const headings = [...document.querySelectorAll("h1, h2")]
										.map((heading) => (heading.textContent || "").replace(/\s+/g, " ").trim())
										.filter(Boolean)
										.slice(0, 10);
									const source =
										document.querySelector("main, article, [role='main']") || document.body;
									const cleaned = source?.cloneNode(true) as HTMLElement | undefined;
									cleaned
										?.querySelectorAll("script, style, noscript, nav, footer, aside")
										.forEach((element) => {
											element.remove();
										});
									const mainText = (cleaned?.textContent || "")
										.replace(/\s+/g, " ")
										.trim()
										.slice(0, 5_500);
									return [
										canonical ? `Canonical URL: ${canonical}` : "",
										headings.length > 0 ? `Headings: ${headings.join(" | ")}` : "",
										mainText ? `Main text: ${mainText}` : "",
									]
										.filter(Boolean)
										.join("\n")
										.slice(0, 6_000);
								})()
							: null,
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
