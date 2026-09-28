import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { summarizeMetadataTabs, summarizeScreenshots } from "../services/codex.js";
import { storage, summaryEvidenceFingerprint } from "../services/storage.js";

const SummarizeRequestSchema = z.object({
	screenshots: z
		.array(
			z
				.object({
					tabId: z.number(),
					image: z.string().max(5_000_000), // ~3.75 MB raw image
					title: z.string().max(2_000),
					url: z.string().max(10_000),
					metaDescription: z.string().max(10_000).optional(),
					ogDescription: z.string().max(10_000).optional(),
					keywords: z.string().max(10_000).optional(),
				})
				.strict(),
		)
		.max(10),
});

const CacheCheckSchema = z.object({
	urls: z.array(z.string()).max(500),
	minimumStage: z.enum(["any", "stage1", "stage2"]).optional(),
	evidence: z
		.array(z.object({ url: z.string().max(10_000), title: z.string().max(2_000) }).strict())
		.max(500)
		.optional(),
});

const SummaryLookupSchema = z.object({
	urls: z.array(z.string()).max(500),
});

const MetadataSummarizeRequestSchema = z.object({
	tabs: z
		.array(
			z
				.object({
					tabId: z.number(),
					title: z.string().max(2_000),
					url: z.string().max(10_000),
					metaDescription: z.string().max(10_000).optional(),
					ogDescription: z.string().max(10_000).optional(),
					keywords: z.string().max(10_000).optional(),
				})
				.strict(),
		)
		.max(10),
});

const SummaryFailuresSchema = z.object({
	stage: z.enum(["stage1"]),
	cooldownMs: z
		.number()
		.int()
		.positive()
		.max(24 * 60 * 60 * 1000)
		.optional(),
	failures: z
		.array(
			z.object({
				url: z.string().min(1).max(5000),
				reason: z.string().max(500).optional(),
			}),
		)
		.min(1)
		.max(500),
});

export const summarizeRoute = new Hono();

/** Check which URLs already have cached summaries (skip re-scanning). */
summarizeRoute.post("/summarize/check", zValidator("json", CacheCheckSchema), (c) => {
	const { urls, minimumStage, evidence } = c.req.valid("json");
	const cached = storage.getCachedUrls(urls, minimumStage || "any", evidence);
	const stage1Blocked = storage.getStage1BlockedUrls(urls, evidence);
	const availability = storage.getSummaryAvailability(urls);
	console.log(`[summarize/check] ${cached.length}/${urls.length} URLs already cached`);
	if (stage1Blocked.length > 0) {
		console.log(
			`[summarize/check] ${stage1Blocked.length}/${urls.length} URLs in Stage 1 cooldown`,
		);
	}
	return c.json({ cached, stage1Blocked, availability });
});

/** Lookup cached summaries by URL (for search). */
summarizeRoute.post("/summarize/lookup", zValidator("json", SummaryLookupSchema), (c) => {
	const { urls } = c.req.valid("json");
	const summaries = storage.getSummariesForUrls(urls);
	const availability = storage.getSummaryAvailability(urls);
	return c.json({ summaries, availability });
});

/** Summarize title/URL/metadata only and cache the Stage 1 results. */
summarizeRoute.post(
	"/summarize/stage1",
	zValidator("json", MetadataSummarizeRequestSchema),
	async (c) => {
		try {
			const { tabs } = c.req.valid("json");
			console.log(`[summarize/stage1] Received ${tabs.length} tabs`);
			const result = await summarizeMetadataTabs(tabs);
			storage.cacheStage1Summaries(
				result.profiles
					.map((profileResult) => {
						const tab = tabs.find((item) => item.tabId === profileResult.tabId);
						const { tabId: _tabId, ...profile } = profileResult;
						return {
							url: tab?.url || "",
							summary: profile.summary,
							profile,
							fingerprint: tab ? summaryEvidenceFingerprint(tab.url, tab.title) : undefined,
						};
					})
					.filter((entry) => entry.url && entry.summary),
			);
			return c.json({
				profiles: result.profiles,
				summaries: result.profiles.map(({ tabId, summary }) => ({ tabId, summary })),
				failures: result.failures,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : "Unknown error";
			console.error(`[summarize/stage1] Error: ${message}`);
			return c.json({ error: message }, 500);
		}
	},
);

summarizeRoute.post("/summarize/failures", zValidator("json", SummaryFailuresSchema), (c) => {
	const { failures, cooldownMs } = c.req.valid("json");
	storage.markStage1Failures(failures, cooldownMs);
	console.log(`[summarize/failures] Marked ${failures.length} Stage 1 cooldowns`);
	return c.json({ ok: true });
});

/** Summarize screenshots and cache the results. */
summarizeRoute.post("/summarize", zValidator("json", SummarizeRequestSchema), async (c) => {
	try {
		const { screenshots } = c.req.valid("json");
		console.log(`[summarize] Received ${screenshots.length} screenshots`);

		const result = await summarizeScreenshots(screenshots);

		// Auto-cache on server
		storage.cacheStage2Summaries(
			result.profiles
				.map((profileResult) => {
					const shot = screenshots.find((sc) => sc.tabId === profileResult.tabId);
					const { tabId: _tabId, ...profile } = profileResult;
					return {
						url: shot?.url || "",
						summary: profile.summary,
						profile,
						fingerprint: shot ? summaryEvidenceFingerprint(shot.url, shot.title) : undefined,
					};
				})
				.filter((entry) => entry.url),
		);

		console.log(`[summarize] Produced and cached ${result.profiles.length} profiles`);
		return c.json({
			profiles: result.profiles,
			summaries: result.profiles.map(({ tabId, summary }) => ({ tabId, summary })),
			failures: result.failures,
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		console.error(`[summarize] Error: ${message}`);
		return c.json({ error: message }, 500);
	}
});
