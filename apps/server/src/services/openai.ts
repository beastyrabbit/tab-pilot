import type {
	GroupingSuggestion,
	OrganizeRequest,
	OrganizeResponse,
	TabInfo,
} from "@tab-orga/shared";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { buildGroupingPrompt, buildSystemPrompt } from "../prompts/grouping.js";
import { storage } from "./storage.js";

const GroupingSuggestionSchema = z.object({
	groupName: z.string(),
	color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]),
	tabIds: z.array(z.number()),
	existingGroupId: z.number().optional(),
	isNew: z.boolean(),
	confidence: z.number().min(0).max(1),
});

const AIGroupingResultSchema = z.object({
	suggestions: z.array(GroupingSuggestionSchema),
	reasoning: z.string(),
});

function getClient(): OpenAI {
	const settings = storage.getSettings();
	if (!settings.openaiApiKey) {
		throw new Error("OpenAI API key not configured");
	}
	return new OpenAI({ apiKey: settings.openaiApiKey });
}

export async function organizeWithAI(request: OrganizeRequest): Promise<OrganizeResponse> {
	const client = getClient();
	const settings = storage.getSettings();
	const rules = storage.getRules();
	const memories = storage.getMemories();

	const systemPrompt = buildSystemPrompt(memories);
	const userPrompt = buildGroupingPrompt(request, rules);

	const completion = await client.beta.chat.completions.parse({
		model: settings.model,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		response_format: zodResponseFormat(AIGroupingResultSchema, "tab_grouping"),
		temperature: 0.3,
	});

	const parsed = completion.choices[0]?.message?.parsed;
	if (!parsed) {
		throw new Error("Failed to parse AI response");
	}

	return {
		suggestions: parsed.suggestions as GroupingSuggestion[],
		reasoning: parsed.reasoning,
	};
}

export async function fetchModels(): Promise<{ id: string; name: string }[]> {
	const client = getClient();
	const models = await client.models.list();
	return models.data
		.filter(
			(m) =>
				m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3") || m.id.includes("o4"),
		)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((m) => ({ id: m.id, name: m.id }));
}

export async function analyzeCorrections(
	originalSuggestions: GroupingSuggestion[],
	appliedSuggestions: GroupingSuggestion[],
	tabs: TabInfo[],
): Promise<string[]> {
	const client = getClient();
	const settings = storage.getSettings();

	const prompt = `You are analyzing how a user modified AI-suggested tab groupings.

Original suggestions:
${JSON.stringify(originalSuggestions, null, 2)}

What the user actually applied:
${JSON.stringify(appliedSuggestions, null, 2)}

Tabs involved:
${tabs.map((t) => `- [${t.id}] ${t.title} (${t.url})`).join("\n")}

Identify patterns in the user's corrections. What preferences can you infer?
Return a JSON array of short observation strings (max 5). Each observation should be a single sentence describing a user preference.
Example: ["User prefers GitHub repos in a 'Development' group", "User separates YouTube music from YouTube tutorials"]`;

	const completion = await client.chat.completions.create({
		model: settings.model,
		messages: [{ role: "user", content: prompt }],
		response_format: { type: "json_object" },
		temperature: 0.3,
	});

	try {
		const content = completion.choices[0]?.message?.content || "{}";
		const result = JSON.parse(content);
		if (Array.isArray(result.observations)) return result.observations;
		if (Array.isArray(result)) return result;
		return [];
	} catch {
		return [];
	}
}
