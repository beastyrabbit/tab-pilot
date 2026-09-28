import type {
	AIEditMemoriesResponse,
	AIMemory,
	AIRuntimeResponse,
	AppendStoredTabsRequest,
	CreateStoredTabSetRequest,
	ErrorResponse,
	GetOrganizeRunResponse,
	HealthResponse,
	OrganizeRequest,
	OrganizeResponse,
	PublicSettings,
	RefineRequest,
	RefineResponse,
	StartOrganizeRunResponse,
	StoredTabSet,
	StoredTabSetSummary,
	TabSemanticProfile,
	TabSemanticProfileResult,
	UserRule,
} from "@tab-orga/shared";

const BASE_URL = "http://127.0.0.1:7777/api";

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

export class ServerOfflineError extends Error {
	constructor() {
		super("Server offline. Run pnpm dev:server");
		this.name = "ServerOfflineError";
	}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${BASE_URL}${path}`, {
			headers: { "Content-Type": "application/json" },
			...options,
		});
	} catch (error) {
		if (error instanceof TypeError && error.message === "Failed to fetch") {
			throw new ServerOfflineError();
		}
		throw error;
	}
	if (!res.ok) {
		const err: ErrorResponse = await res.json().catch(() => ({ error: "Unknown error" }));
		throw new Error(err.error);
	}
	return res.json();
}

export const serverApi = {
	health(): Promise<HealthResponse> {
		return request("/health");
	},

	organize(body: OrganizeRequest): Promise<OrganizeResponse> {
		return request("/organize", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	startOrganizeRun(body: OrganizeRequest): Promise<StartOrganizeRunResponse> {
		return request("/organize/runs", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	getOrganizeRun(id: string): Promise<GetOrganizeRunResponse> {
		return request(`/organize/runs/${id}`);
	},

	getActiveOrganizeRun(windowId?: number): Promise<GetOrganizeRunResponse> {
		const query = typeof windowId === "number" ? `?windowId=${encodeURIComponent(windowId)}` : "";
		return request(`/organize/runs/active${query}`);
	},

	refine(body: RefineRequest): Promise<RefineResponse> {
		return request("/organize/refine", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	getSettings(): Promise<PublicSettings> {
		return request("/settings");
	},

	updateSettings(settings: Partial<PublicSettings>): Promise<PublicSettings> {
		return request("/settings", {
			method: "PUT",
			body: JSON.stringify(settings),
		});
	},

	getAIRuntime(): Promise<AIRuntimeResponse> {
		return request("/ai/runtime");
	},

	getRules(): Promise<UserRule[]> {
		return request("/rules");
	},

	createRule(rule: Omit<UserRule, "id" | "createdAt">): Promise<UserRule> {
		return request("/rules", {
			method: "POST",
			body: JSON.stringify(rule),
		});
	},

	updateRule(id: string, updates: Partial<UserRule>): Promise<UserRule> {
		return request(`/rules/${id}`, {
			method: "PUT",
			body: JSON.stringify(updates),
		});
	},

	deleteRule(id: string): Promise<void> {
		return request(`/rules/${id}`, { method: "DELETE" });
	},

	getMemories(): Promise<AIMemory[]> {
		return request("/memory");
	},

	createMemory(observation: string): Promise<AIMemory> {
		return request("/memory", {
			method: "POST",
			body: JSON.stringify({ observation }),
		});
	},

	updateMemory(id: string, observation: string): Promise<AIMemory> {
		return request(`/memory/${id}`, {
			method: "PUT",
			body: JSON.stringify({ observation }),
		});
	},

	deleteMemory(id: string): Promise<void> {
		return request(`/memory/${id}`, { method: "DELETE" });
	},

	clearMemories(): Promise<void> {
		return request("/memory", { method: "DELETE" });
	},

	aiEditMemories(instruction: string): Promise<AIEditMemoriesResponse> {
		return request("/memory/ai-edit", {
			method: "POST",
			body: JSON.stringify({ instruction }),
		});
	},

	async summarize(
		screenshots: Array<{
			tabId: number;
			image: string;
			title: string;
			url: string;
			metaDescription?: string;
			ogDescription?: string;
			keywords?: string;
		}>,
	): Promise<{
		profiles: TabSemanticProfileResult[];
		summaries: Array<{ tabId: number; summary: string }>;
		failures: Array<{ tabId: number; error: string }>;
	}> {
		return request("/summarize", {
			method: "POST",
			body: JSON.stringify({ screenshots }),
		});
	},

	async summarizeStage1(
		tabs: Array<{
			tabId: number;
			title: string;
			url: string;
			metaDescription?: string;
			ogDescription?: string;
			keywords?: string;
		}>,
	): Promise<{
		profiles: TabSemanticProfileResult[];
		summaries: Array<{ tabId: number; summary: string }>;
		failures: Array<{ tabId: number; error: string }>;
	}> {
		return request("/summarize/stage1", {
			method: "POST",
			body: JSON.stringify({ tabs }),
		});
	},

	/** Ask server which URLs already have cached summaries. */
	async checkCachedUrls(
		urls: string[],
		minimumStage: "any" | "stage1" | "stage2" = "any",
		evidence?: Array<{ url: string; title: string }>,
	): Promise<Set<string>> {
		const result = await request<{ cached: string[] }>("/summarize/check", {
			method: "POST",
			body: JSON.stringify({ urls, minimumStage, evidence }),
		});
		return new Set(result.cached);
	},

	async checkSummaryState(
		urls: string[],
		minimumStage: "any" | "stage1" | "stage2" = "any",
		evidence?: Array<{ url: string; title: string }>,
	): Promise<{
		cached: Set<string>;
		stage1Blocked: Set<string>;
		availability: Record<string, SummaryAvailability>;
	}> {
		const result = await request<{
			cached: string[];
			stage1Blocked?: string[];
			availability: Record<string, SummaryAvailability>;
		}>("/summarize/check", {
			method: "POST",
			body: JSON.stringify({ urls, minimumStage, evidence }),
		});
		return {
			cached: new Set(result.cached),
			stage1Blocked: new Set(result.stage1Blocked || []),
			availability: result.availability,
		};
	},

	async checkSummaryAvailability(
		urls: string[],
		minimumStage: "any" | "stage1" | "stage2" = "any",
	): Promise<Record<string, SummaryAvailability>> {
		const result = await request<{
			availability: Record<string, SummaryAvailability>;
		}>("/summarize/check", {
			method: "POST",
			body: JSON.stringify({ urls, minimumStage }),
		});
		return result.availability;
	},

	/** Get cached summaries by URL from server. */
	async lookupSummaries(urls: string[]): Promise<Record<string, string>> {
		const result = await request<{ summaries: Record<string, string> }>("/summarize/lookup", {
			method: "POST",
			body: JSON.stringify({ urls }),
		});
		return result.summaries;
	},

	async lookupSummaryAvailability(urls: string[]): Promise<Record<string, SummaryAvailability>> {
		const result = await request<{
			availability: Record<string, SummaryAvailability>;
		}>("/summarize/lookup", {
			method: "POST",
			body: JSON.stringify({ urls }),
		});
		return result.availability;
	},

	markStage1Failures(
		failures: Array<{ url: string; reason?: string }>,
		cooldownMs = 30 * 60 * 1000,
	): Promise<{ ok: true }> {
		return request("/summarize/failures", {
			method: "POST",
			body: JSON.stringify({ stage: "stage1", failures, cooldownMs }),
		});
	},

	listStoredSets(): Promise<{ sets: StoredTabSetSummary[] }> {
		return request("/stored-sets");
	},

	getStoredSet(id: string): Promise<{ set: StoredTabSet }> {
		return request(`/stored-sets/${id}`);
	},

	createStoredSet(body: CreateStoredTabSetRequest): Promise<{ set: StoredTabSet }> {
		return request("/stored-sets", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	appendStoredTabs(id: string, body: AppendStoredTabsRequest): Promise<{ set: StoredTabSet }> {
		return request(`/stored-sets/${id}/tabs`, {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	restoreStoredSet(id: string): Promise<{ set: StoredTabSet }> {
		return request(`/stored-sets/${id}/restore`);
	},

	deleteStoredSet(id: string): Promise<void> {
		return request(`/stored-sets/${id}`, { method: "DELETE" });
	},
};
