import type { AIMemory, OrganizeRequest, UserRule } from "@tab-orga/shared";

export function buildSystemPrompt(memories: AIMemory[]): string {
	let prompt = `You are an expert browser tab organizer. Your job is to analyze open browser tabs and suggest logical groupings.

Guidelines:
- Group tabs by topic, project, or activity (e.g., "Development", "Social Media", "Research", "Shopping")
- Use descriptive but concise group names (1-3 words)
- Choose colors that semantically match the group (e.g., red for entertainment/YouTube, blue for development, green for productivity)
- If tabs already belong to groups, prefer adding to those existing groups rather than creating new ones
- Assign a confidence score (0-1) to each suggestion
- Every tab must be assigned to exactly one group
- Aim for 3-8 groups total depending on tab diversity`;

	if (memories.length > 0) {
		prompt += "\n\nLearned user preferences (respect these):";
		for (const memory of memories) {
			prompt += `\n- ${memory.observation}`;
		}
	}

	return prompt;
}

export function buildGroupingPrompt(request: OrganizeRequest, rules: UserRule[]): string {
	const { tabs, existingGroups } = request;
	const enabledRules = rules.filter((r) => r.enabled);

	let prompt = "Organize these browser tabs into groups:\n\n";

	prompt += "## Tabs\n";
	for (const tab of tabs) {
		let line = `- [ID: ${tab.id}] "${tab.title}" — ${tab.url}`;
		if (tab.metaDescription) {
			line += ` | Meta: ${tab.metaDescription}`;
		}
		if (tab.pageText) {
			line += ` | Content: ${tab.pageText.slice(0, 200)}...`;
		}
		prompt += `${line}\n`;
	}

	if (existingGroups.length > 0) {
		prompt += "\n## Existing Groups (prefer adding to these)\n";
		for (const group of existingGroups) {
			prompt += `- Group "${group.title || "Untitled"}" (ID: ${group.id}, color: ${group.color}): tab IDs [${group.tabIds.join(", ")}]\n`;
		}
	}

	if (enabledRules.length > 0) {
		prompt += "\n## User Rules (MUST follow these)\n";
		for (const rule of enabledRules) {
			prompt += `- Tabs matching ${rule.matchType}:"${rule.pattern}" MUST go in group "${rule.targetGroup}"`;
			if (rule.color) prompt += ` (color: ${rule.color})`;
			prompt += "\n";
		}
	}

	return prompt;
}
