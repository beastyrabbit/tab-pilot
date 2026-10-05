import type { PublicSettings, TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { organizeViaProxy, refineViaProxy } from "./proxyAi.js";

const settings: PublicSettings = {
	provider: "cliproxy",
	proxyUrl: "http://proxy.test:8317/v1",
	proxyApiKey: "",
	model: "model-a",
	contentDepth: "meta",
	generalPrompt: "Keep gaming separate from media.",
	organizationThinking: "low",
	summaryThinking: "low",
	serviceTier: "default",
	groupTitleLength: "short",
	groupingMode: "soft",
	preserveExistingGroups: false,
	allowRenameGroups: false,
	allowComplexTitles: false,
	allowAddToExistingGroups: true,
	keepUngroupedTabs: true,
	closeDuplicateTabs: false,
	keepNewestDuplicate: true,
};

const tabs: TabInfo[] = [
	{
		id: 1,
		windowId: 9,
		url: "https://www.twitch.tv/somechannel?ref=abc",
		title: "somechannel - Twitch",
		favIconUrl: `data:image/png;base64,${"A".repeat(5000)}`,
		groupId: 50,
	},
	{ id: 2, windowId: 9, url: "https://github.com/org/repo", title: "org/repo", groupId: -1 },
	{ id: 3, windowId: 9, url: "https://example.com/", title: "Example", groupId: -1 },
];
const groups: TabGroupInfo[] = [
	{ id: 50, title: "Streaming", color: "red", collapsed: false, tabIds: [1] },
];
const fixed = [{ id: 50, title: "Streaming", color: "red", markedAt: "2026-01-01T00:00:00Z" }];

function reply(content: unknown, status = 200) {
	return new Response(
		JSON.stringify({
			choices: [
				{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } },
			],
		}),
		{ status },
	);
}

const sentBody = (fetch: ReturnType<typeof vi.fn>, call = 0) =>
	JSON.parse(fetch.mock.calls[call][1].body as string);

afterEach(() => vi.unstubAllGlobals());

describe("organizeViaProxy", () => {
	it("sends a compact prompt with structured output and the user's preferences", async () => {
		const fetch = vi.fn().mockResolvedValue(reply({ suggestions: [], reasoning: "" }));
		vi.stubGlobal("fetch", fetch);
		await organizeViaProxy(settings, tabs, groups, "", fixed, {
			memories: ["Railway tabs belong with deployments"],
			rules: [
				{
					id: "r1",
					pattern: "github.com",
					matchType: "domain",
					targetGroup: "Dev",
					enabled: true,
					createdAt: "",
				},
			],
		});
		const body = sentBody(fetch);
		const prompt = body.messages[1].content as string;
		expect(body.reasoning_effort).toBe("low");
		expect(body.temperature).toBeUndefined();
		expect(body.response_format.type).toBe("json_schema");
		expect(prompt).not.toContain("data:image");
		expect(prompt).not.toContain("ref=abc");
		expect(prompt).toContain('"url":"twitch.tv/somechannel"');
		expect(prompt).toContain('"fixed":true');
		expect(prompt).toContain("Keep gaming separate from media.");
		expect(prompt).toContain("Railway tabs belong with deployments");
		expect(prompt).toContain('domain is "github.com" belong in "Dev"');
		expect(prompt).not.toContain("MeshCentral");
	});

	it("repairs invalid colors, unknown group ids and duplicate tabs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				reply({
					suggestions: [
						{
							groupName: "Dev",
							color: "brown",
							tabIds: [2, 2, 99],
							existingGroupId: 777,
							confidence: 4,
						},
						{
							groupName: "Misc",
							color: "blue",
							tabIds: [2, 3],
							existingGroupId: null,
							confidence: 0.5,
						},
					],
					reasoning: "ok",
				}),
			),
		);
		const result = await organizeViaProxy(settings, tabs, [], "", []);
		expect(result.suggestions).toEqual([
			{
				groupName: "Dev",
				color: "grey",
				tabIds: [2],
				isNew: true,
				existingGroupId: undefined,
				confidence: 1,
			},
			{
				groupName: "Misc",
				color: "blue",
				tabIds: [3],
				isNew: true,
				existingGroupId: undefined,
				confidence: 0.5,
			},
		]);
	});

	it("retries once when the model returns malformed JSON", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(reply("not json {"))
			.mockResolvedValueOnce(reply({ suggestions: [], reasoning: "second try" }));
		vi.stubGlobal("fetch", fetch);
		const result = await organizeViaProxy(settings, tabs, groups, "", []);
		expect(result.reasoning).toBe("second try");
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(sentBody(fetch, 1).response_format).toBeUndefined();
	});

	const twoGroups: TabGroupInfo[] = [
		{ id: 50, title: "Streaming", color: "red", collapsed: false, tabIds: [1] },
		{ id: 60, title: "Dev", color: "blue", collapsed: false, tabIds: [2] },
	];

	it("keeps grouped tabs the model left out in their group instead of ungrouping them", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				reply({
					suggestions: [
						{
							groupName: "Misc",
							color: "green",
							tabIds: [3],
							existingGroupId: null,
							confidence: 1,
						},
					],
					reasoning: "",
				}),
			),
		);
		const result = await organizeViaProxy(settings, tabs, twoGroups, "", []);
		expect(result.suggestions.map((s) => [s.groupName, s.existingGroupId, s.tabIds])).toEqual([
			["Misc", undefined, [3]],
			["Streaming", 50, [1]],
			["Dev", 60, [2]],
		]);
	});

	it("locks existing membership and colors when preserving existing groups", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				reply({
					suggestions: [
						{
							groupName: "Dev",
							color: "pink",
							tabIds: [1, 2, 3],
							existingGroupId: 60,
							confidence: 1,
						},
					],
					reasoning: "",
				}),
			),
		);
		const result = await organizeViaProxy(
			{ ...settings, preserveExistingGroups: true },
			tabs,
			twoGroups,
			"",
			[],
		);
		expect(result.suggestions).toEqual([
			expect.objectContaining({
				groupName: "Streaming",
				color: "red",
				existingGroupId: 50,
				tabIds: [1],
			}),
			expect.objectContaining({
				groupName: "Dev",
				color: "blue",
				existingGroupId: 60,
				tabIds: [2, 3],
			}),
		]);
	});

	it("falls back to plain JSON when the proxy rejects structured output", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("bad request", { status: 400 }))
			.mockResolvedValueOnce(reply({ suggestions: [], reasoning: "plain" }));
		vi.stubGlobal("fetch", fetch);
		const result = await organizeViaProxy(settings, tabs, groups, "", []);
		expect(result.reasoning).toBe("plain");
		expect(sentBody(fetch, 1).response_format).toBeUndefined();
	});

	it("does not retry authentication failures", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
		vi.stubGlobal("fetch", fetch);
		await expect(organizeViaProxy(settings, tabs, groups, "", [])).rejects.toThrow("401");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("refineViaProxy", () => {
	it("keeps fixed-group tabs protected and cleans memory candidates", async () => {
		const fetch = vi.fn().mockResolvedValue(
			reply({
				suggestions: [
					{
						groupName: "Video",
						color: "blue",
						tabIds: [1, 3],
						existingGroupId: null,
						confidence: 0.9,
					},
				],
				reasoning: "moved",
				memoryCandidates: [
					{ observation: "  Prefer short titles ", reason: "feedback" },
					{ observation: "" },
				],
			}),
		);
		vi.stubGlobal("fetch", fetch);
		const result = await refineViaProxy(
			settings,
			[
				{
					groupName: "Streaming",
					color: "red",
					tabIds: [1],
					existingGroupId: 50,
					isNew: false,
					confidence: 1,
				},
			],
			tabs,
			"move example into video",
			{ groups, fixedGroups: fixed, target: { groupName: "Streaming" } },
		);
		expect(result.suggestions).toContainEqual(
			expect.objectContaining({ groupName: "Streaming", existingGroupId: 50, tabIds: [1] }),
		);
		expect(result.suggestions).toContainEqual(
			expect.objectContaining({ groupName: "Video", tabIds: [3] }),
		);
		expect(result.memoryCandidates).toEqual([
			{ observation: "Prefer short titles", reason: "feedback" },
		]);
		expect(sentBody(fetch).messages[1].content).toContain('proposed group "Streaming"');
	});
});
