import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDirectory = await mkdtemp(join(tmpdir(), "tab-orga-cache-"));
process.env.TAB_ORGA_DATA_DIR = dataDirectory;
const { storage, summaryEvidenceFingerprint } = await import("./storage.js");

afterAll(async () => {
	await rm(dataDirectory, { recursive: true });
});

describe("summary evidence cache", () => {
	it("invalidates a profile when the current title fingerprint changes", () => {
		const url = "https://example.com/project";
		storage.cacheStage1Summaries([
			{
				url,
				summary: "An old project page",
				fingerprint: summaryEvidenceFingerprint(url, "Old project title"),
			},
		]);

		expect(storage.getCachedUrls([url], "stage1", [{ url, title: "Old project title" }])).toEqual([
			url,
		]);
		expect(storage.getCachedUrls([url], "stage1", [{ url, title: "New project title" }])).toEqual(
			[],
		);
		expect(
			storage.getSummaryAvailability([url], [{ url, title: "New project title" }])[url]?.stage,
		).toBe("none");

		storage.markStage1Failures([{ url, reason: "New title could not be summarized" }]);
		expect(storage.getStage1BlockedUrls([url], [{ url, title: "New project title" }])).toEqual([
			url,
		]);
	});
});
