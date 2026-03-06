import type { TabInfo, UserRule } from "@tab-orga/shared";
import { describe, expect, it } from "vitest";
import { findMatchingRule, matchRule } from "./rules.js";

const makeTab = (url: string, title = "Test"): TabInfo => ({
	id: 1,
	windowId: 1,
	url,
	title,
	groupId: -1,
});

const makeRule = (
	pattern: string,
	matchType: UserRule["matchType"],
	targetGroup = "Test",
): UserRule => ({
	id: "r1",
	pattern,
	matchType,
	targetGroup,
	enabled: true,
	createdAt: "2024-01-01",
});

describe("matchRule", () => {
	it("matches domain exactly", () => {
		const rule = makeRule("github.com", "domain");
		expect(matchRule(makeTab("https://github.com/foo"), rule)).toBe(true);
		expect(matchRule(makeTab("https://gitlab.com/foo"), rule)).toBe(false);
	});

	it("matches subdomains", () => {
		const rule = makeRule("github.com", "domain");
		expect(matchRule(makeTab("https://gist.github.com/foo"), rule)).toBe(true);
	});

	it("matches url-contains", () => {
		const rule = makeRule("youtube.com/watch", "url-contains");
		expect(matchRule(makeTab("https://www.youtube.com/watch?v=123"), rule)).toBe(true);
		expect(matchRule(makeTab("https://www.youtube.com/channel/abc"), rule)).toBe(false);
	});

	it("matches title-contains (case-insensitive)", () => {
		const rule = makeRule("react", "title-contains");
		expect(matchRule(makeTab("https://example.com", "React Documentation"), rule)).toBe(true);
		expect(matchRule(makeTab("https://example.com", "Vue Documentation"), rule)).toBe(false);
	});

	it("matches regex", () => {
		const rule = makeRule("github\\.com/(issues|pulls)", "regex");
		expect(matchRule(makeTab("https://github.com/issues"), rule)).toBe(true);
		expect(matchRule(makeTab("https://github.com/pulls"), rule)).toBe(true);
		expect(matchRule(makeTab("https://github.com/repos"), rule)).toBe(false);
	});

	it("ignores disabled rules", () => {
		const rule = { ...makeRule("github.com", "domain"), enabled: false };
		expect(matchRule(makeTab("https://github.com/foo"), rule)).toBe(false);
	});
});

describe("findMatchingRule", () => {
	it("returns first matching rule", () => {
		const rules = [
			makeRule("github.com", "domain", "Development"),
			makeRule("youtube.com", "domain", "Entertainment"),
		];
		const result = findMatchingRule(makeTab("https://github.com/foo"), rules);
		expect(result?.targetGroup).toBe("Development");
	});

	it("returns undefined when no match", () => {
		const rules = [makeRule("github.com", "domain", "Development")];
		const result = findMatchingRule(makeTab("https://google.com"), rules);
		expect(result).toBeUndefined();
	});
});
