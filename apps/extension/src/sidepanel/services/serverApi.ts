import type {
	AIEditMemoriesResponse,
	AIMemory,
	ErrorResponse,
	HealthResponse,
	LearnRequest,
	ModelsResponse,
	OrganizeRequest,
	OrganizeResponse,
	PublicSettings,
	RefineRequest,
	RefineResponse,
	UserRule,
} from "@tab-orga/shared";

const BASE_URL = "http://localhost:7777/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
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

	refine(body: RefineRequest): Promise<RefineResponse> {
		return request("/organize/refine", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	learn(body: LearnRequest): Promise<void> {
		return request("/organize/learn", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	getSettings(): Promise<PublicSettings> {
		return request("/settings");
	},

	updateSettings(
		settings: Partial<{ model: string; contentDepth: string; generalPrompt: string }>,
	): Promise<PublicSettings> {
		return request("/settings", {
			method: "PUT",
			body: JSON.stringify(settings),
		});
	},

	getModels(): Promise<ModelsResponse> {
		return request("/models");
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
		screenshots: Array<{ tabId: number; image: string; title: string; url: string }>,
	): Promise<{ summaries: Array<{ tabId: number; summary: string }> }> {
		// Caller (screenshotCache.ts) batches into chunks of 10 to match server's .max(10) limit
		return request<{ summaries: Array<{ tabId: number; summary: string }> }>("/summarize", {
			method: "POST",
			body: JSON.stringify({ screenshots }),
		});
	},

	/** Ask server which URLs already have cached summaries. */
	async checkCachedUrls(urls: string[]): Promise<Set<string>> {
		const result = await request<{ cached: string[] }>("/summarize/check", {
			method: "POST",
			body: JSON.stringify({ urls }),
		});
		return new Set(result.cached);
	},

	/** Get cached summaries by URL from server. */
	async lookupSummaries(urls: string[]): Promise<Record<string, string>> {
		const result = await request<{ summaries: Record<string, string> }>("/summarize/lookup", {
			method: "POST",
			body: JSON.stringify({ urls }),
		});
		return result.summaries;
	},
};
