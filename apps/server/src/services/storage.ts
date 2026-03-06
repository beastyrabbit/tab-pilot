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
	openaiApiKey: "",
	model: "gpt-4o",
	contentDepth: "meta",
	port: 7777,
};

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
};
