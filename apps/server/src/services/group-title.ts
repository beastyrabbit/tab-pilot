import type { GroupTitleLength } from "@tab-orga/shared";

function titleWords(title: string): string[] {
	return [...title.matchAll(/[A-Za-z0-9][A-Za-z0-9+#-]*/g)].map((match) => match[0]);
}

function titleCase(word: string): string {
	if (!word) return "";
	const upperAcronyms = new Set(["ai", "api", "aws", "css", "gh", "gpu", "html", "js", "ml", "ui"]);
	const lower = word.toLowerCase();
	if (upperAcronyms.has(lower)) return lower.toUpperCase();
	return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

export function enforceGroupTitleLength(name: string, length: GroupTitleLength = "medium"): string {
	const words = titleWords(name);
	if (length === "short") {
		const letters =
			words.length >= 2
				? `${words[0][0] || ""}${words[1][0] || ""}`
				: (words[0] || name || "TB").slice(0, 2);
		return letters.padEnd(2, "X").slice(0, 2).toUpperCase();
	}
	if (length === "medium") {
		return titleCase(words[0] || name.trim() || "Tabs").slice(0, 24);
	}
	const longTitle = words.slice(0, 4).map(titleCase).join(" ").trim();
	return (longTitle || name.trim() || "Tabs").slice(0, 48);
}
