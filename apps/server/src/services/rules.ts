import type { TabInfo, UserRule } from "@tab-orga/shared";

export function matchRule(tab: TabInfo, rule: UserRule): boolean {
	if (!rule.enabled) return false;

	switch (rule.matchType) {
		case "domain": {
			try {
				const domain = new URL(tab.url).hostname;
				return domain === rule.pattern || domain.endsWith(`.${rule.pattern}`);
			} catch {
				return false;
			}
		}
		case "url-contains":
			return tab.url.includes(rule.pattern);
		case "title-contains":
			return tab.title.toLowerCase().includes(rule.pattern.toLowerCase());
		case "regex":
			try {
				return (
					new RegExp(rule.pattern, "i").test(tab.url) ||
					new RegExp(rule.pattern, "i").test(tab.title)
				);
			} catch {
				return false;
			}
		default:
			return false;
	}
}

export function findMatchingRule(tab: TabInfo, rules: UserRule[]): UserRule | undefined {
	return rules.find((rule) => matchRule(tab, rule));
}
