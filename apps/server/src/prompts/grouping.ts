import type { AIMemory, OrganizeRequest, UserRule } from "@tab-orga/shared";
import { encode } from "@toon-format/toon";

export function buildSystemPrompt(memories: AIMemory[], generalPrompt?: string): string {
	let prompt = `You are an expert browser tab organizer. Your ONLY job is to analyze open browser tabs and return a JSON grouping result. Do NOT run any shell commands, do NOT read or write files, do NOT execute any code. Just analyze the tab data provided and respond with the structured JSON output.

Guidelines:
- Group tabs by topic, project, or activity (e.g., "Development", "Social Media", "Research", "Shopping")
- Use descriptive but concise group names (1-3 words)
- Choose colors that semantically match the group (e.g., red for entertainment/YouTube, blue for development, green for productivity)
- If tabs already belong to groups, prefer adding to those existing groups rather than creating new ones
- Assign a confidence score (0-1) to each suggestion
- Not every tab needs a group. If a tab doesn't fit any group, leave it out of all suggestions. Do NOT force tabs into groups.
- If the user says "never group X" or "don't group X", that tab MUST NOT appear in any group's tabIds array.
- Aim for 3-8 groups total depending on tab diversity`;

	if (generalPrompt) {
		prompt += `\n\nUser instructions (follow these closely):\n${generalPrompt}`;
	}

	if (memories.length > 0) {
		prompt += "\n\nLearned user preferences (MUST respect these):";
		for (const memory of memories) {
			prompt += `\n- ${memory.observation}`;
		}
	}

	return prompt;
}

export function buildGroupingPrompt(request: OrganizeRequest, rules: UserRule[]): string {
	const { tabs, existingGroups } = request;
	const enabledRules = rules.filter((r) => r.enabled);

	const hasMeta = tabs.some((t) => t.metaDescription);
	const hasContent = tabs.some((t) => t.pageText);

	// Build tab data as plain objects, then encode to TOON
	// Strip tabs and newlines to keep TOON columns aligned
	const sanitize = (s: string) => s.replace(/[\t\n\r]/g, " ");
	const tabData = tabs.map((t) => {
		const row: Record<string, unknown> = {
			id: t.id,
			title: sanitize(t.title),
			url: t.url.replace(/[\t\n\r]/g, ""),
		};
		if (hasMeta) row.meta = sanitize(t.metaDescription || "");
		if (hasContent) row.content = sanitize((t.pageText || "").slice(0, 200));
		return row;
	});

	let prompt = "Organize these browser tabs into groups.\n\n";
	prompt += encode({ tabs: tabData }, { delimiter: "\t" });

	// Detect domains with 3+ tabs — prompt AI to consider topic vs tool split
	const domainCounts = new Map<string, number>();
	for (const tab of tabs) {
		try {
			const domain = new URL(tab.url).hostname.replace(/^www\./, "");
			domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
		} catch {}
	}
	const heavyDomains = [...domainCounts.entries()]
		.filter(([, count]) => count >= 3)
		.sort((a, b) => b[1] - a[1]);

	if (heavyDomains.length > 0) {
		prompt += "\n\nIMPORTANT — Multiple tabs from the same site:\n";
		for (const [domain, count] of heavyDomains) {
			prompt += `- ${domain}: ${count} tabs\n`;
		}
		prompt += `For each site above, decide: should these tabs be grouped BY TOPIC (e.g., separate GitHub repos go into different project groups) or BY TOOL (e.g., all GitHub tabs stay together in a "Development" group)? Choose whichever produces the most useful grouping for the user. If the tabs cover clearly distinct topics, split by topic. If they're all related to the same activity, keep them together.`;
	}

	if (existingGroups.length > 0) {
		const groupData = existingGroups.map((g) => ({
			id: g.id,
			title: g.title || "Untitled",
			color: g.color,
			tabIds: g.tabIds,
		}));
		prompt += `\n${encode({ existingGroups: groupData }, { delimiter: "\t" })}`;
	}

	if (enabledRules.length > 0) {
		prompt += "\nRules (MUST follow):\n";
		for (const rule of enabledRules) {
			prompt += `- ${rule.matchType}:"${rule.pattern}" → "${rule.targetGroup}"`;
			if (rule.color) prompt += ` (${rule.color})`;
			prompt += "\n";
		}
	}

	return prompt;
}
