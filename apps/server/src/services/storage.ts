import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AIMemory, ServerSettings, UserRule } from "@tab-orga/shared";

const DATA_DIR = resolve(import.meta.dirname, "../../data");

function ensureDataDir(): void {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true });
	}
}

function readJson<T>(filename: string, fallback: T): T {
	ensureDataDir();
	const path = resolve(DATA_DIR, filename);
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return fallback;
	}
}

function writeJson<T>(filename: string, data: T): void {
	ensureDataDir();
	writeFileSync(resolve(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

const DEFAULT_SETTINGS: ServerSettings = {
	model: "gpt-5.3-codex",
	contentDepth: "meta",
	generalPrompt: "",
	port: 7777,
};

interface ScreenshotCacheEntry {
	summary: string;
	capturedAt: number;
	url: string;
}

type ScreenshotCache = Record<string, ScreenshotCacheEntry>; // keyed by URL

const SCREENSHOT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

export const storage = {
	getSettings(): ServerSettings {
		return readJson("settings.json", DEFAULT_SETTINGS);
	},

	updateSettings(partial: Partial<ServerSettings>): ServerSettings {
		const current = this.getSettings();
		const updated = { ...current, ...partial };
		writeJson("settings.json", updated);
		return updated;
	},

	getRules(): UserRule[] {
		return readJson("rules.json", []);
	},

	saveRules(rules: UserRule[]): void {
		writeJson("rules.json", rules);
	},

	getMemories(): AIMemory[] {
		return readJson("memory.json", []);
	},

	saveMemories(memories: AIMemory[]): void {
		writeJson("memory.json", memories);
	},

	// ── Screenshot summary cache ──────────────────────────────────────

	getScreenshotCache(): ScreenshotCache {
		return readJson("screenshot-cache.json", {});
	},

	saveScreenshotCache(cache: ScreenshotCache): void {
		writeJson("screenshot-cache.json", cache);
	},

	/** Return URLs that already have a fresh cached summary. */
	getCachedUrls(urls: string[]): string[] {
		const cache = this.getScreenshotCache();
		const now = Date.now();
		return urls.filter((url) => {
			const entry = cache[url];
			return entry && now - entry.capturedAt < SCREENSHOT_CACHE_TTL;
		});
	},

	/** Store summaries for the given URLs, evicting stale entries. */
	cacheSummaries(summaries: Array<{ url: string; summary: string }>): void {
		const cache = this.getScreenshotCache();
		const now = Date.now();
		// Evict stale entries
		for (const url of Object.keys(cache)) {
			if (now - cache[url].capturedAt >= SCREENSHOT_CACHE_TTL) {
				delete cache[url];
			}
		}
		for (const s of summaries) {
			if (s.summary) {
				cache[s.url] = { summary: s.summary, capturedAt: now, url: s.url };
			}
		}
		this.saveScreenshotCache(cache);
	},

	/** Get summaries for the given URLs from cache (respects TTL). */
	getSummariesForUrls(urls: string[]): Record<string, string> {
		const cache = this.getScreenshotCache();
		const now = Date.now();
		const result: Record<string, string> = {};
		for (const url of urls) {
			const entry = cache[url];
			if (entry?.summary && now - entry.capturedAt < SCREENSHOT_CACHE_TTL) {
				result[url] = entry.summary;
			}
		}
		return result;
	},
};
