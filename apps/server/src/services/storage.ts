import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
	AIMemory,
	CreateStoredTabSetRequest,
	GroupColor,
	ServerSettings,
	StoredTab,
	StoredTabInput,
	StoredTabMetadata,
	StoredTabSet,
	StoredTabSetSummary,
	TabSemanticProfile,
	UserRule,
} from "@tab-orga/shared";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

const serverRoot =
	basename(import.meta.dirname) === "dist"
		? resolve(import.meta.dirname, "..")
		: resolve(import.meta.dirname, "../..");
const DATA_DIR = process.env.TAB_ORGA_DATA_DIR
	? resolve(process.env.TAB_ORGA_DATA_DIR)
	: resolve(serverRoot, "data");
const DB_PATH = resolve(DATA_DIR, "tab-orga.sqlite");
const SETTINGS_KEY = "server";

function ensureDataDir(): void {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true });
	}
}

function readLegacyJson<T>(filename: string, fallback: T): T {
	const path = resolve(DATA_DIR, filename);
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return fallback;
	}
}

const DEFAULT_SETTINGS: ServerSettings = {
	generalPrompt: "",
	groupTitleLength: "medium",
};

interface ScreenshotCacheEntry {
	summary: string;
	capturedAt: number;
	url: string;
}

type ScreenshotCache = Record<string, ScreenshotCacheEntry>;
export type SummaryStage = "none" | "stage1" | "stage2";

export interface SummaryAvailability {
	url: string;
	normalizedUrl: string;
	stage: SummaryStage;
	bestSummary?: string;
	stage1Summary?: string;
	stage1Profile?: TabSemanticProfile;
	stage2Summary?: string;
	stage2Profile?: TabSemanticProfile;
	stage1CapturedAt?: number;
	stage2CapturedAt?: number;
	stage1FailureAt?: number;
	stage1RetryAfter?: number;
	stage1FailureReason?: string;
}

const SUMMARY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const settingsTable = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

const rulesTable = sqliteTable("rules", {
	id: text("id").primaryKey(),
	pattern: text("pattern").notNull(),
	matchType: text("match_type").notNull(),
	targetGroup: text("target_group").notNull(),
	color: text("color"),
	enabled: integer("enabled", { mode: "boolean" }).notNull(),
	createdAt: text("created_at").notNull(),
});

const memoriesTable = sqliteTable("memories", {
	id: text("id").primaryKey(),
	observation: text("observation").notNull(),
	createdAt: text("created_at").notNull(),
	source: text("source").notNull(),
});

const summaryCacheTable = sqliteTable("summary_cache", {
	url: text("url").primaryKey(),
	summary: text("summary").notNull(),
	capturedAt: integer("captured_at").notNull(),
	stage1Summary: text("stage1_summary"),
	stage1Profile: text("stage1_profile"),
	stage1Fingerprint: text("stage1_fingerprint"),
	stage1CapturedAt: integer("stage1_captured_at"),
	stage1FailureAt: integer("stage1_failure_at"),
	stage1RetryAfter: integer("stage1_retry_after"),
	stage1FailureReason: text("stage1_failure_reason"),
	stage2Summary: text("stage2_summary"),
	stage2Profile: text("stage2_profile"),
	stage2Fingerprint: text("stage2_fingerprint"),
	stage2CapturedAt: integer("stage2_captured_at"),
});

const storedTabSetsTable = sqliteTable("stored_tab_sets", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	color: text("color").notNull(),
	summary: text("summary").notNull(),
	keywords: text("keywords").notNull(),
	domains: text("domains").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

const storedTabsTable = sqliteTable(
	"stored_tabs",
	{
		id: text("id").primaryKey(),
		setId: text("set_id")
			.notNull()
			.references(() => storedTabSetsTable.id, { onDelete: "cascade" }),
		normalizedUrl: text("normalized_url").notNull(),
		originalUrl: text("original_url").notNull(),
		title: text("title").notNull(),
		favIconUrl: text("favicon_url"),
		metadata: text("metadata").notNull(),
		stage1Summary: text("stage1_summary"),
		stage2Summary: text("stage2_summary"),
		order: integer("sort_order").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => ({
		setUrlUnique: uniqueIndex("idx_stored_tabs_set_url_unique").on(
			table.setId,
			table.normalizedUrl,
		),
	}),
);

const schema = {
	settingsTable,
	rulesTable,
	memoriesTable,
	summaryCacheTable,
	storedTabSetsTable,
	storedTabsTable,
};

ensureDataDir();

const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA journal_mode = WAL;");

const db = drizzle({ client: sqlite, schema });

function ensureColumn(table: string, column: string, definition: string): void {
	const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	if (columns.some((entry) => entry.name === column)) return;
	sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function initializeDatabase(): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS rules (
			id TEXT PRIMARY KEY,
			pattern TEXT NOT NULL,
			match_type TEXT NOT NULL,
			target_group TEXT NOT NULL,
			color TEXT,
			enabled INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS memories (
			id TEXT PRIMARY KEY,
			observation TEXT NOT NULL,
			created_at TEXT NOT NULL,
			source TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS summary_cache (
			url TEXT PRIMARY KEY,
			summary TEXT NOT NULL,
			captured_at INTEGER NOT NULL,
				stage1_summary TEXT,
				stage1_captured_at INTEGER,
				stage1_failure_at INTEGER,
				stage1_retry_after INTEGER,
				stage1_failure_reason TEXT,
				stage2_summary TEXT,
				stage2_captured_at INTEGER
			);

		CREATE TABLE IF NOT EXISTS stored_tab_sets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			summary TEXT NOT NULL,
			keywords TEXT NOT NULL,
			domains TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS stored_tabs (
			id TEXT PRIMARY KEY,
			set_id TEXT NOT NULL REFERENCES stored_tab_sets(id) ON DELETE CASCADE,
			normalized_url TEXT NOT NULL,
			original_url TEXT NOT NULL,
			title TEXT NOT NULL,
			favicon_url TEXT,
			metadata TEXT NOT NULL,
			stage1_summary TEXT,
			stage1_profile TEXT,
			stage2_summary TEXT,
			stage2_profile TEXT,
			sort_order INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_summary_cache_captured_at
			ON summary_cache (captured_at);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_stored_tabs_set_url_unique
			ON stored_tabs (set_id, normalized_url);
		CREATE INDEX IF NOT EXISTS idx_stored_tabs_set_order
			ON stored_tabs (set_id, sort_order);
	`);

	ensureColumn("summary_cache", "stage1_summary", "TEXT");
	ensureColumn("summary_cache", "stage1_profile", "TEXT");
	ensureColumn("summary_cache", "stage1_fingerprint", "TEXT");
	ensureColumn("summary_cache", "stage1_captured_at", "INTEGER");
	ensureColumn("summary_cache", "stage1_failure_at", "INTEGER");
	ensureColumn("summary_cache", "stage1_retry_after", "INTEGER");
	ensureColumn("summary_cache", "stage1_failure_reason", "TEXT");
	ensureColumn("summary_cache", "stage2_summary", "TEXT");
	ensureColumn("summary_cache", "stage2_profile", "TEXT");
	ensureColumn("summary_cache", "stage2_fingerprint", "TEXT");
	ensureColumn("summary_cache", "stage2_captured_at", "INTEGER");
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS idx_summary_cache_stage1_captured_at
			ON summary_cache (stage1_captured_at);
		CREATE INDEX IF NOT EXISTS idx_summary_cache_stage1_retry_after
			ON summary_cache (stage1_retry_after);
		CREATE INDEX IF NOT EXISTS idx_summary_cache_stage2_captured_at
			ON summary_cache (stage2_captured_at);
		UPDATE summary_cache
		SET stage2_summary = summary,
			stage2_captured_at = captured_at
		WHERE stage2_summary IS NULL
			AND summary IS NOT NULL;
	`);
}

function writeSettings(settings: ServerSettings): void {
	const sanitized = sanitizeSettings(settings);
	db.insert(settingsTable)
		.values({ key: SETTINGS_KEY, value: JSON.stringify(sanitized) })
		.onConflictDoUpdate({
			target: settingsTable.key,
			set: { value: JSON.stringify(sanitized) },
		})
		.run();
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

function sanitizeSettings(raw: unknown): ServerSettings {
	const value = raw && typeof raw === "object" ? (raw as Partial<ServerSettings>) : {};
	return {
		generalPrompt:
			typeof value.generalPrompt === "string"
				? value.generalPrompt
				: DEFAULT_SETTINGS.generalPrompt,
		groupTitleLength: oneOf(
			value.groupTitleLength,
			["short", "medium", "long"] as const,
			DEFAULT_SETTINGS.groupTitleLength,
		),
	};
}

function readStoredSettings(): ServerSettings {
	const row = db
		.select({ value: settingsTable.value })
		.from(settingsTable)
		.where(eq(settingsTable.key, SETTINGS_KEY))
		.get();

	if (!row) return DEFAULT_SETTINGS;
	try {
		return sanitizeSettings(JSON.parse(row.value));
	} catch {
		return DEFAULT_SETTINGS;
	}
}

function withTransaction<T>(fn: () => T): T {
	sqlite.exec("BEGIN IMMEDIATE;");
	try {
		const result = fn();
		sqlite.exec("COMMIT;");
		return result;
	} catch (error) {
		sqlite.exec("ROLLBACK;");
		throw error;
	}
}

export function normalizeUrl(url: string): string {
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		parsed.hash = "";
		parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
		if (parsed.protocol === "http:" && parsed.port === "80") parsed.port = "";
		if (parsed.protocol === "https:" && parsed.port === "443") parsed.port = "";
		if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
		parsed.searchParams.sort();
		return parsed.toString();
	} catch {
		return trimmed;
	}
}

export function summaryEvidenceFingerprint(url: string, title: string): string {
	return createHash("sha256")
		.update(`${normalizeUrl(url)}\n${title.trim().replace(/\s+/g, " ")}`)
		.digest("hex");
}

function saveRuleRows(rules: UserRule[]): void {
	withTransaction(() => {
		db.delete(rulesTable).run();
		if (rules.length === 0) return;
		db.insert(rulesTable)
			.values(
				rules.map((rule) => ({
					id: rule.id,
					pattern: rule.pattern,
					matchType: rule.matchType,
					targetGroup: rule.targetGroup,
					color: rule.color ?? null,
					enabled: rule.enabled,
					createdAt: rule.createdAt,
				})),
			)
			.run();
	});
}

function saveMemoryRows(memories: AIMemory[]): void {
	withTransaction(() => {
		db.delete(memoriesTable).run();
		if (memories.length === 0) return;
		db.insert(memoriesTable)
			.values(
				memories.map((memory) => ({
					id: memory.id,
					observation: memory.observation,
					createdAt: memory.createdAt,
					source: memory.source,
				})),
			)
			.run();
	});
}

type SummaryCacheRow = typeof summaryCacheTable.$inferSelect;

function isFresh(capturedAt: number | null | undefined): capturedAt is number {
	return typeof capturedAt === "number" && Date.now() - capturedAt < SUMMARY_CACHE_TTL;
}

function parseSemanticProfile(value: string | null | undefined): TabSemanticProfile | undefined {
	if (!value) return undefined;
	try {
		const parsed = JSON.parse(value) as Partial<TabSemanticProfile>;
		if (!parsed || typeof parsed.summary !== "string") return undefined;
		return {
			summary: parsed.summary,
			subjects: Array.isArray(parsed.subjects)
				? parsed.subjects.filter((item): item is string => typeof item === "string")
				: [],
			activity: typeof parsed.activity === "string" ? parsed.activity : "",
			namedEntities: Array.isArray(parsed.namedEntities)
				? parsed.namedEntities.filter((item): item is string => typeof item === "string")
				: [],
			confidence:
				typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
			needsMoreEvidence: parsed.needsMoreEvidence === true,
		};
	} catch {
		return undefined;
	}
}

function availabilityFromRow(
	rawUrl: string,
	normalized: string,
	row?: SummaryCacheRow,
	expectedFingerprint?: string,
): SummaryAvailability {
	if (!row) {
		return { url: rawUrl, normalizedUrl: normalized, stage: "none" };
	}

	const stage2Summary =
		isFresh(row.stage2CapturedAt) &&
		(!expectedFingerprint || row.stage2Fingerprint === expectedFingerprint)
			? row.stage2Summary || undefined
			: undefined;
	const stage1Summary =
		isFresh(row.stage1CapturedAt) &&
		(!expectedFingerprint || row.stage1Fingerprint === expectedFingerprint)
			? row.stage1Summary || undefined
			: undefined;
	const stage2Profile = stage2Summary ? parseSemanticProfile(row.stage2Profile) : undefined;
	const stage1Profile = stage1Summary ? parseSemanticProfile(row.stage1Profile) : undefined;
	const stage1RetryAfter =
		typeof row.stage1RetryAfter === "number" && row.stage1RetryAfter > Date.now()
			? row.stage1RetryAfter
			: undefined;
	const failureFields = {
		stage1FailureAt: row.stage1FailureAt ?? undefined,
		stage1RetryAfter,
		stage1FailureReason: row.stage1FailureReason ?? undefined,
	};

	if (stage2Summary) {
		return {
			url: rawUrl,
			normalizedUrl: normalized,
			stage: "stage2",
			bestSummary: stage2Summary,
			stage1Summary,
			stage1Profile,
			stage2Summary,
			stage2Profile,
			stage1CapturedAt: row.stage1CapturedAt ?? undefined,
			stage2CapturedAt: row.stage2CapturedAt ?? undefined,
			...failureFields,
		};
	}

	if (stage1Summary) {
		return {
			url: rawUrl,
			normalizedUrl: normalized,
			stage: "stage1",
			bestSummary: stage1Summary,
			stage1Summary,
			stage1Profile,
			stage1CapturedAt: row.stage1CapturedAt ?? undefined,
			...failureFields,
		};
	}

	return { url: rawUrl, normalizedUrl: normalized, stage: "none", ...failureFields };
}

function getSummaryRows(urls: string[]): Map<string, SummaryCacheRow> {
	const normalizedUrls = [...new Set(urls.map(normalizeUrl))];
	if (normalizedUrls.length === 0) return new Map();
	const rows = db
		.select()
		.from(summaryCacheTable)
		.where(inArray(summaryCacheTable.url, normalizedUrls))
		.all();
	return new Map(rows.map((row) => [row.url, row]));
}

function cacheSummaryRows(
	summaries: Array<{
		url: string;
		summary: string;
		profile?: TabSemanticProfile;
		fingerprint?: string;
	}>,
	capturedAt: number,
	stage: "stage1" | "stage2",
): void {
	cacheSummaryRowsWithTimestamps(
		summaries.map((entry) => ({ ...entry, capturedAt })),
		stage,
	);
}

function cacheSummaryRowsWithTimestamps(
	summaries: Array<{
		url: string;
		summary: string;
		capturedAt: number;
		profile?: TabSemanticProfile;
		fingerprint?: string;
	}>,
	stage: "stage1" | "stage2",
): void {
	const rows = summaries
		.filter((entry) => entry.url && entry.summary.trim())
		.map((entry) => ({
			url: normalizeUrl(entry.url),
			summary: entry.summary.trim(),
			capturedAt: entry.capturedAt || Date.now(),
			profile: entry.profile ? JSON.stringify(entry.profile) : undefined,
			fingerprint: entry.fingerprint,
		}));

	if (rows.length === 0) return;

	withTransaction(() => {
		for (const row of rows) {
			const existing = db
				.select()
				.from(summaryCacheTable)
				.where(eq(summaryCacheTable.url, row.url))
				.get();
			const existingStage2Fresh = isFresh(existing?.stage2CapturedAt);
			const bestSummary =
				stage === "stage1" && existingStage2Fresh ? existing?.summary : row.summary;
			const bestCapturedAt =
				stage === "stage1" && existingStage2Fresh ? existing?.capturedAt : row.capturedAt;
			db.insert(summaryCacheTable)
				.values({
					url: row.url,
					summary: bestSummary || row.summary,
					capturedAt: bestCapturedAt || row.capturedAt,
					stage1Summary: stage === "stage1" ? row.summary : existing?.stage1Summary,
					stage1Profile: stage === "stage1" ? row.profile : existing?.stage1Profile,
					stage1Fingerprint: stage === "stage1" ? row.fingerprint : existing?.stage1Fingerprint,
					stage1CapturedAt: stage === "stage1" ? row.capturedAt : existing?.stage1CapturedAt,
					stage1FailureAt: stage === "stage1" ? null : existing?.stage1FailureAt,
					stage1RetryAfter: stage === "stage1" ? null : existing?.stage1RetryAfter,
					stage1FailureReason: stage === "stage1" ? null : existing?.stage1FailureReason,
					stage2Summary: stage === "stage2" ? row.summary : existing?.stage2Summary,
					stage2Profile: stage === "stage2" ? row.profile : existing?.stage2Profile,
					stage2Fingerprint: stage === "stage2" ? row.fingerprint : existing?.stage2Fingerprint,
					stage2CapturedAt: stage === "stage2" ? row.capturedAt : existing?.stage2CapturedAt,
				})
				.onConflictDoUpdate({
					target: summaryCacheTable.url,
					set: {
						summary: bestSummary || row.summary,
						capturedAt: bestCapturedAt || row.capturedAt,
						stage1Summary: stage === "stage1" ? row.summary : existing?.stage1Summary,
						stage1Profile: stage === "stage1" ? row.profile : existing?.stage1Profile,
						stage1Fingerprint: stage === "stage1" ? row.fingerprint : existing?.stage1Fingerprint,
						stage1CapturedAt: stage === "stage1" ? row.capturedAt : existing?.stage1CapturedAt,
						stage1FailureAt: stage === "stage1" ? null : existing?.stage1FailureAt,
						stage1RetryAfter: stage === "stage1" ? null : existing?.stage1RetryAfter,
						stage1FailureReason: stage === "stage1" ? null : existing?.stage1FailureReason,
						stage2Summary: stage === "stage2" ? row.summary : existing?.stage2Summary,
						stage2Profile: stage === "stage2" ? row.profile : existing?.stage2Profile,
						stage2Fingerprint: stage === "stage2" ? row.fingerprint : existing?.stage2Fingerprint,
						stage2CapturedAt: stage === "stage2" ? row.capturedAt : existing?.stage2CapturedAt,
					},
				})
				.run();
		}
	});
}

function migrateLegacyJson(): void {
	const hasSettings = db
		.select({ key: settingsTable.key })
		.from(settingsTable)
		.where(eq(settingsTable.key, SETTINGS_KEY))
		.get();
	if (!hasSettings) {
		const legacySettings = readLegacyJson<Partial<ServerSettings> | null>("settings.json", null);
		if (legacySettings) {
			writeSettings(sanitizeSettings(legacySettings));
		}
	}

	const hasRules = db.select({ id: rulesTable.id }).from(rulesTable).limit(1).get();
	const legacyRules = readLegacyJson<UserRule[]>("rules.json", []);
	if (!hasRules && legacyRules.length > 0) {
		saveRuleRows(legacyRules);
	}

	const hasMemories = db.select({ id: memoriesTable.id }).from(memoriesTable).limit(1).get();
	const legacyMemories = readLegacyJson<AIMemory[]>("memory.json", []);
	if (!hasMemories && legacyMemories.length > 0) {
		saveMemoryRows(legacyMemories);
	}

	const hasSummaries = db
		.select({ url: summaryCacheTable.url })
		.from(summaryCacheTable)
		.limit(1)
		.get();
	const legacyCache = readLegacyJson<ScreenshotCache>("screenshot-cache.json", {});
	const legacySummaries = Object.values(legacyCache)
		.filter((entry) => entry.url && entry.summary)
		.map((entry) => ({
			url: entry.url,
			summary: entry.summary,
			capturedAt: entry.capturedAt || Date.now(),
		}));
	if (!hasSummaries && legacySummaries.length > 0) {
		cacheSummaryRowsWithTimestamps(legacySummaries, "stage2");
	}
}

function parseJsonArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function parseMetadata(value: string): StoredTabMetadata {
	try {
		const parsed = JSON.parse(value) as StoredTabMetadata;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function domainFor(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function isHttpUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function keywordCandidates(tab: StoredTabInput): string[] {
	const source = [
		tab.title,
		tab.metadata?.keywords,
		tab.metadata?.metaDescription,
		tab.stage1Summary,
		tab.stage2Summary,
	]
		.filter(Boolean)
		.join(" ");
	return [...source.matchAll(/[a-z0-9][a-z0-9-]{2,}/gi)]
		.map((match) => match[0].toLowerCase())
		.filter((word) => !["https", "http", "www", "com", "the", "and", "for", "with"].includes(word));
}

function summarizeStoredTabs(name: string, tabs: StoredTabInput[], domains: string[]): string {
	const domainText = domains.slice(0, 4).join(", ");
	const titleSample = tabs
		.slice(0, 3)
		.map((tab) => tab.title)
		.filter(Boolean)
		.join("; ");
	return `${name}: ${tabs.length} stored tab${tabs.length === 1 ? "" : "s"}${
		domainText ? ` from ${domainText}` : ""
	}${titleSample ? `. Examples: ${titleSample}` : ""}`;
}

function deriveDomains(tabs: StoredTabInput[]): string[] {
	return [...new Set(tabs.map((tab) => domainFor(tab.originalUrl)).filter(Boolean))].slice(0, 20);
}

function deriveKeywords(tabs: StoredTabInput[]): string[] {
	const counts = new Map<string, number>();
	for (const tab of tabs) {
		for (const word of keywordCandidates(tab)) {
			counts.set(word, (counts.get(word) || 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 24)
		.map(([word]) => word);
}

function dedupeStoredTabs(tabs: StoredTabInput[]): StoredTabInput[] {
	const seen = new Set<string>();
	const result: StoredTabInput[] = [];
	for (const tab of tabs) {
		if (!isHttpUrl(tab.originalUrl)) continue;
		const normalized = normalizeUrl(tab.originalUrl);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push({
			...tab,
			title: tab.title.trim() || tab.originalUrl,
			metadata: tab.metadata || {},
			stage1Summary: tab.stage1Summary?.trim() || undefined,
			stage2Summary: tab.stage2Summary?.trim() || undefined,
		});
	}
	return result;
}

type StoredSetRow = typeof storedTabSetsTable.$inferSelect;
type StoredTabRow = typeof storedTabsTable.$inferSelect;

function toStoredSetSummary(row: StoredSetRow, tabCount: number): StoredTabSetSummary {
	return {
		id: row.id,
		name: row.name,
		color: row.color as GroupColor,
		summary: row.summary,
		keywords: parseJsonArray(row.keywords),
		domains: parseJsonArray(row.domains),
		tabCount,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toStoredTab(row: StoredTabRow): StoredTab {
	return {
		id: row.id,
		setId: row.setId,
		normalizedUrl: row.normalizedUrl,
		originalUrl: row.originalUrl,
		title: row.title,
		favIconUrl: row.favIconUrl ?? undefined,
		metadata: parseMetadata(row.metadata),
		stage1Summary: row.stage1Summary ?? undefined,
		stage2Summary: row.stage2Summary ?? undefined,
		order: row.order,
		createdAt: row.createdAt,
	};
}

function tabCountMap(): Map<string, number> {
	const rows = sqlite
		.prepare("SELECT set_id AS setId, COUNT(*) AS count FROM stored_tabs GROUP BY set_id")
		.all() as Array<{ setId: string; count: number }>;
	return new Map(rows.map((row) => [row.setId, row.count]));
}

initializeDatabase();
migrateLegacyJson();

export const storage = {
	getSettings(): ServerSettings {
		return readStoredSettings();
	},

	updateSettings(partial: Partial<ServerSettings>): ServerSettings {
		const updated = { ...this.getSettings(), ...partial };
		writeSettings(updated);
		return updated;
	},

	getRules(): UserRule[] {
		return db
			.select()
			.from(rulesTable)
			.all()
			.map((rule) => ({
				id: rule.id,
				pattern: rule.pattern,
				matchType: rule.matchType as UserRule["matchType"],
				targetGroup: rule.targetGroup,
				color: rule.color ?? undefined,
				enabled: rule.enabled,
				createdAt: rule.createdAt,
			}));
	},

	saveRules(rules: UserRule[]): void {
		saveRuleRows(rules);
	},

	getMemories(): AIMemory[] {
		return db
			.select()
			.from(memoriesTable)
			.all()
			.map((memory) => ({
				id: memory.id,
				observation: memory.observation,
				createdAt: memory.createdAt,
				source: memory.source as AIMemory["source"],
			}));
	},

	saveMemories(memories: AIMemory[]): void {
		saveMemoryRows(memories);
	},

	getScreenshotCache(): ScreenshotCache {
		const availability = this.getSummaryAvailability(
			db
				.select({ url: summaryCacheTable.url })
				.from(summaryCacheTable)
				.all()
				.map((entry) => entry.url),
		);
		return Object.fromEntries(
			Object.values(availability)
				.filter((entry) => entry.bestSummary)
				.map((entry) => [
					entry.url,
					{
						url: entry.url,
						summary: entry.bestSummary || "",
						capturedAt: entry.stage2CapturedAt || entry.stage1CapturedAt || Date.now(),
					},
				]),
		);
	},

	saveScreenshotCache(cache: ScreenshotCache): void {
		withTransaction(() => {
			db.delete(summaryCacheTable).run();
		});
		this.cacheStage2Summaries(
			Object.values(cache).map((entry) => ({ url: entry.url, summary: entry.summary })),
		);
	},

	getSummaryAvailability(
		urls: string[],
		evidence: Array<{ url: string; title: string }> = [],
	): Record<string, SummaryAvailability> {
		const rows = getSummaryRows(urls);
		const fingerprints = new Map(
			evidence.map((entry) => [
				normalizeUrl(entry.url),
				summaryEvidenceFingerprint(entry.url, entry.title),
			]),
		);
		return Object.fromEntries(
			urls.map((url) => {
				const normalized = normalizeUrl(url);
				return [
					url,
					availabilityFromRow(url, normalized, rows.get(normalized), fingerprints.get(normalized)),
				];
			}),
		);
	},

	getCachedUrls(
		urls: string[],
		minimumStage: "any" | "stage1" | "stage2" = "any",
		evidence: Array<{ url: string; title: string }> = [],
	): string[] {
		const availability = this.getSummaryAvailability(urls, evidence);
		const rows = getSummaryRows(urls);
		const fingerprints = new Map(
			evidence.map((entry) => [
				normalizeUrl(entry.url),
				summaryEvidenceFingerprint(entry.url, entry.title),
			]),
		);
		return urls.filter((url) => {
			const stage = availability[url]?.stage;
			const expected = fingerprints.get(normalizeUrl(url));
			const row = rows.get(normalizeUrl(url));
			if (expected) {
				const matchesStage1 = row?.stage1Fingerprint === expected;
				const matchesStage2 = row?.stage2Fingerprint === expected;
				if (minimumStage === "stage2" && !matchesStage2) return false;
				if (minimumStage === "stage1" && !matchesStage1 && !matchesStage2) return false;
				if (minimumStage === "any" && !matchesStage1 && !matchesStage2) return false;
			}
			if (minimumStage === "stage2") return stage === "stage2";
			if (minimumStage === "stage1") return stage === "stage1" || stage === "stage2";
			return stage === "stage1" || stage === "stage2";
		});
	},

	getStage1BlockedUrls(
		urls: string[],
		evidence: Array<{ url: string; title: string }> = [],
	): string[] {
		const availability = this.getSummaryAvailability(urls, evidence);
		return urls.filter((url) => {
			const state = availability[url];
			return state?.stage === "none" && Boolean(state.stage1RetryAfter);
		});
	},

	markStage1Failures(
		failures: Array<{ url: string; reason?: string }>,
		cooldownMs = 30 * 60 * 1000,
	): void {
		const now = Date.now();
		const retryAfter = now + cooldownMs;
		const rows = failures
			.filter((failure) => failure.url)
			.map((failure) => ({
				url: normalizeUrl(failure.url),
				reason: (failure.reason || "Stage 1 failed").slice(0, 500),
			}));
		if (rows.length === 0) return;

		withTransaction(() => {
			for (const row of rows) {
				const existing = db
					.select()
					.from(summaryCacheTable)
					.where(eq(summaryCacheTable.url, row.url))
					.get();
				db.insert(summaryCacheTable)
					.values({
						url: row.url,
						summary: existing?.summary || "",
						capturedAt: existing?.capturedAt || 0,
						stage1Summary: existing?.stage1Summary,
						stage1CapturedAt: existing?.stage1CapturedAt,
						stage1FailureAt: now,
						stage1RetryAfter: retryAfter,
						stage1FailureReason: row.reason,
						stage2Summary: existing?.stage2Summary,
						stage2CapturedAt: existing?.stage2CapturedAt,
					})
					.onConflictDoUpdate({
						target: summaryCacheTable.url,
						set: {
							stage1FailureAt: now,
							stage1RetryAfter: retryAfter,
							stage1FailureReason: row.reason,
						},
					})
					.run();
			}
		});
	},

	cacheSummaries(
		summaries: Array<{
			url: string;
			summary: string;
			profile?: TabSemanticProfile;
			fingerprint?: string;
		}>,
	): void {
		this.cacheStage2Summaries(summaries);
	},

	cacheStage1Summaries(
		summaries: Array<{
			url: string;
			summary: string;
			profile?: TabSemanticProfile;
			fingerprint?: string;
		}>,
	): void {
		const now = Date.now();
		cacheSummaryRows(summaries, now, "stage1");
	},

	cacheStage2Summaries(
		summaries: Array<{
			url: string;
			summary: string;
			profile?: TabSemanticProfile;
			fingerprint?: string;
		}>,
	): void {
		const now = Date.now();
		cacheSummaryRows(summaries, now, "stage2");
	},

	getSummariesForUrls(urls: string[]): Record<string, string> {
		const availability = this.getSummaryAvailability(urls);
		return Object.fromEntries(
			urls
				.map((url) => [url, availability[url]?.bestSummary] as const)
				.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
		);
	},

	listStoredTabSets(): StoredTabSetSummary[] {
		const counts = tabCountMap();
		return db
			.select()
			.from(storedTabSetsTable)
			.all()
			.map((row) => toStoredSetSummary(row, counts.get(row.id) || 0))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	},

	getStoredTabSet(id: string): StoredTabSet | null {
		const row = db.select().from(storedTabSetsTable).where(eq(storedTabSetsTable.id, id)).get();
		if (!row) return null;
		const tabs = db
			.select()
			.from(storedTabsTable)
			.where(eq(storedTabsTable.setId, id))
			.all()
			.map(toStoredTab)
			.sort((a, b) => a.order - b.order);
		return {
			...toStoredSetSummary(row, tabs.length),
			tabs,
		};
	},

	createStoredTabSet(input: CreateStoredTabSetRequest): StoredTabSet {
		const tabs = dedupeStoredTabs(input.tabs);
		if (tabs.length === 0) throw new Error("Cannot store an empty tab set.");
		const id = nanoid();
		const now = new Date().toISOString();
		const name = input.name.trim() || "Stored Tabs";
		const domains = deriveDomains(tabs);
		const keywords = deriveKeywords(tabs);
		const summary = input.summary?.trim() || summarizeStoredTabs(name, tabs, domains);

		withTransaction(() => {
			db.insert(storedTabSetsTable)
				.values({
					id,
					name,
					color: input.color || "grey",
					summary,
					keywords: JSON.stringify(keywords),
					domains: JSON.stringify(domains),
					createdAt: now,
					updatedAt: now,
				})
				.run();
			db.insert(storedTabsTable)
				.values(
					tabs.map((tab, index) => ({
						id: nanoid(),
						setId: id,
						normalizedUrl: normalizeUrl(tab.originalUrl),
						originalUrl: tab.originalUrl,
						title: tab.title,
						favIconUrl: tab.favIconUrl ?? null,
						metadata: JSON.stringify(tab.metadata || {}),
						stage1Summary: tab.stage1Summary ?? null,
						stage2Summary: tab.stage2Summary ?? null,
						order: index,
						createdAt: now,
					})),
				)
				.run();
		});

		const created = this.getStoredTabSet(id);
		if (!created) throw new Error("Stored tab set was not created.");
		return created;
	},

	appendStoredTabs(setId: string, incomingTabs: StoredTabInput[]): StoredTabSet | null {
		const set = this.getStoredTabSet(setId);
		if (!set) return null;

		const existingUrls = new Set(set.tabs.map((tab) => tab.normalizedUrl));
		const tabs = dedupeStoredTabs(incomingTabs).filter(
			(tab) => !existingUrls.has(normalizeUrl(tab.originalUrl)),
		);
		if (tabs.length === 0) return set;

		const now = new Date().toISOString();
		const maxOrderRow = sqlite
			.prepare("SELECT MAX(sort_order) AS maxOrder FROM stored_tabs WHERE set_id = ?")
			.get(setId) as { maxOrder: number | null };
		const startOrder = (maxOrderRow.maxOrder ?? -1) + 1;
		const domains = [...new Set([...set.domains, ...deriveDomains(tabs)])].slice(0, 20);
		const keywords = [...new Set([...set.keywords, ...deriveKeywords(tabs)])].slice(0, 24);

		withTransaction(() => {
			db.insert(storedTabsTable)
				.values(
					tabs.map((tab, index) => ({
						id: nanoid(),
						setId,
						normalizedUrl: normalizeUrl(tab.originalUrl),
						originalUrl: tab.originalUrl,
						title: tab.title,
						favIconUrl: tab.favIconUrl ?? null,
						metadata: JSON.stringify(tab.metadata || {}),
						stage1Summary: tab.stage1Summary ?? null,
						stage2Summary: tab.stage2Summary ?? null,
						order: startOrder + index,
						createdAt: now,
					})),
				)
				.onConflictDoNothing()
				.run();
			db.update(storedTabSetsTable)
				.set({
					domains: JSON.stringify(domains),
					keywords: JSON.stringify(keywords),
					updatedAt: now,
				})
				.where(eq(storedTabSetsTable.id, setId))
				.run();
		});

		return this.getStoredTabSet(setId);
	},

	deleteStoredTabSet(id: string): boolean {
		const existing = this.getStoredTabSet(id);
		if (!existing) return false;
		db.delete(storedTabSetsTable).where(eq(storedTabSetsTable.id, id)).run();
		return true;
	},
};
