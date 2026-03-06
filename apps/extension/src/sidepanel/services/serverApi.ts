import type {
	AIMemory,
	ErrorResponse,
	HealthResponse,
	LearnRequest,
	ModelsResponse,
	OrganizeRequest,
	OrganizeResponse,
	PublicSettings,
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
		settings: Partial<{ model: string; contentDepth: string }>,
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

	deleteMemory(id: string): Promise<void> {
		return request(`/memory/${id}`, { method: "DELETE" });
	},

	clearMemories(): Promise<void> {
		return request("/memory", { method: "DELETE" });
	},
};
