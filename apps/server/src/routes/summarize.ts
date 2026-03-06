import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { summarizeScreenshots } from "../services/codex.js";
import { storage } from "../services/storage.js";

const SummarizeRequestSchema = z.object({
	screenshots: z.array(
		z.object({
			tabId: z.number(),
			image: z.string(), // base64 JPEG
			title: z.string(),
			url: z.string(),
		}),
	),
});

const CacheCheckSchema = z.object({
	urls: z.array(z.string()),
});

const SummaryLookupSchema = z.object({
	urls: z.array(z.string()),
});

export const summarizeRoute = new Hono();

/** Check which URLs already have cached summaries (skip re-scanning). */
summarizeRoute.post("/summarize/check", zValidator("json", CacheCheckSchema), (c) => {
	const { urls } = c.req.valid("json");
	const cached = storage.getCachedUrls(urls);
	console.log(`[summarize/check] ${cached.length}/${urls.length} URLs already cached`);
	return c.json({ cached });
});

/** Lookup cached summaries by URL (for search). */
summarizeRoute.post("/summarize/lookup", zValidator("json", SummaryLookupSchema), (c) => {
	const { urls } = c.req.valid("json");
	const summaries = storage.getSummariesForUrls(urls);
	return c.json({ summaries });
});

/** Summarize screenshots and cache the results. */
summarizeRoute.post("/summarize", zValidator("json", SummarizeRequestSchema), async (c) => {
	try {
		const { screenshots } = c.req.valid("json");
		console.log(`[summarize] Received ${screenshots.length} screenshots`);

		const summaries = await summarizeScreenshots(screenshots);

		// Auto-cache on server
		storage.cacheSummaries(
			summaries
				.map((s) => {
					const shot = screenshots.find((sc) => sc.tabId === s.tabId);
					return { url: shot?.url || "", summary: s.summary };
				})
				.filter((s) => s.url),
		);

		console.log(`[summarize] Produced and cached ${summaries.length} summaries`);
		return c.json({ summaries });
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		console.error(`[summarize] Error: ${message}`);
		return c.json({ error: message }, 500);
	}
});
