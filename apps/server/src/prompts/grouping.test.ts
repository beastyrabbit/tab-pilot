import type { OrganizeRequest } from "@tab-orga/shared";
import { describe, expect, it } from "vitest";
import { buildGroupingPrompt, buildSystemPrompt } from "./grouping.js";

describe("Prompt builders", () => {
	it("buildSystemPrompt includes base instructions", () => {
		const prompt = buildSystemPrompt([]);
		expect(prompt).toContain("browser tab organizer");
		expect(prompt).toContain("confidence");
	});

	it("buildSystemPrompt includes memories when present", () => {
		const prompt = buildSystemPrompt([
			{
				id: "1",
				observation: "User prefers GitHub in Development",
				createdAt: "2024-01-01",
				source: "correction",
			},
		]);
		expect(prompt).toContain("User prefers GitHub in Development");
		expect(prompt).toContain("Learned user preferences");
	});

	it("buildGroupingPrompt formats tabs in TOON tabular format", () => {
		const request: OrganizeRequest = {
			tabs: [
				{
					id: 1,
					windowId: 1,
					url: "https://github.com",
					title: "GitHub",
					groupId: -1,
				},
			],
			existingGroups: [],
			contentDepth: "title-url",
		};
		const prompt = buildGroupingPrompt(request, []);
		expect(prompt).toContain("tabs[1");
		expect(prompt).toContain("GitHub");
		expect(prompt).toContain("github.com");
	});

	it("buildGroupingPrompt includes existing groups", () => {
		const request: OrganizeRequest = {
			tabs: [],
			existingGroups: [
				{
					id: 100,
					title: "Dev",
					color: "blue",
					collapsed: false,
					tabIds: [1, 2],
				},
			],
			contentDepth: "title-url",
		};
		const prompt = buildGroupingPrompt(request, []);
		expect(prompt).toContain("existingGroups");
		expect(prompt).toContain("Dev");
		expect(prompt).toContain("blue");
	});

	it("buildGroupingPrompt includes user rules", () => {
		const request: OrganizeRequest = {
			tabs: [],
			existingGroups: [],
			contentDepth: "title-url",
		};
		const rules = [
			{
				id: "r1",
				pattern: "github.com",
				matchType: "domain" as const,
				targetGroup: "Development",
				enabled: true,
				createdAt: "2024-01-01",
			},
		];
		const prompt = buildGroupingPrompt(request, rules);
		expect(prompt).toContain("Rules");
		expect(prompt).toContain("github.com");
		expect(prompt).toContain("Development");
	});
});
