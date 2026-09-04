import type { GroupingSuggestion, OrganizeRequest, TabInfo, UserRule } from "@tab-orga/shared";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, enforceRuleAssignments, sanitizeSuggestions } from "./codex.js";

function tab(id: number, url: string, title: string, groupId = -1): TabInfo {
	return { id, windowId: 1, url, title, groupId };
}

describe("tab analysis policy", () => {
	it("uses semantic project and topic grouping before site fallback", () => {
		const prompt = buildSystemPrompt("a test window", [], undefined, "medium");
		expect(prompt).toContain("project or research groups for three or more tabs");
		expect(prompt).toContain("same named project/artifact");
		expect(prompt).toContain("group by site/app only as a fallback");
		expect(prompt).toContain("leave uncertain or unrelated tabs ungrouped");
		expect(prompt).toContain("untrusted evidence");
	});

	it("deduplicates assignments globally and rejects unknown tab and group IDs", () => {
		const tabs = [tab(1, "https://docs.example/a", "A"), tab(2, "https://docs.example/b", "B")];
		const result = sanitizeSuggestions(
			[
				{ groupName: "First", color: "blue", tabIds: [1, 2, 99], confidence: 4 },
				{ groupName: "Second", color: "invalid", tabIds: [2], existingGroupId: 404 },
			],
			tabs,
			"medium",
			new Set([10]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ tabIds: [1, 2], confidence: 1, isNew: true });
	});

	it("makes the first matching enabled rule deterministic and preserves a matching group", () => {
		const tabs = [
			tab(1, "https://github.com/acme/terra", "Terra", 8),
			tab(2, "https://github.com/acme/sol", "Sol"),
			tab(3, "https://example.com/news", "News"),
		];
		const rules: UserRule[] = [
			{
				id: "github",
				pattern: "github.com",
				matchType: "domain",
				targetGroup: "Build",
				color: "green",
				enabled: true,
				createdAt: "2026-01-01",
			},
			{
				id: "terra",
				pattern: "Terra",
				matchType: "title-contains",
				targetGroup: "Wrong",
				enabled: true,
				createdAt: "2026-01-02",
			},
		];
		const ai: GroupingSuggestion[] = [
			{
				groupName: "Reading",
				color: "blue",
				tabIds: [1, 3],
				isNew: true,
				confidence: 0.7,
				basis: "topic",
			},
		];
		const existingGroups: OrganizeRequest["existingGroups"] = [
			{ id: 8, title: "Build", color: "purple", collapsed: false, tabIds: [1] },
		];

		const result = enforceRuleAssignments(ai, tabs, rules, existingGroups, "medium");
		expect(result.find((group) => group.groupName === "Build")).toMatchObject({
			tabIds: [1, 2],
			existingGroupId: 8,
			color: "green",
			basis: "rule",
			confidence: 1,
		});
		expect(result.find((group) => group.groupName === "Reading")?.tabIds).toEqual([3]);
		expect(result.some((group) => group.groupName === "Wrong")).toBe(false);
	});
});
