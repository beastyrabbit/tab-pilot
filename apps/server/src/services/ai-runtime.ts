import {
	createModels,
	hasApi,
	type Model,
	type OpenAICodexResponsesOptions,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { AIRuntimeResponse } from "@tab-orga/shared";
import { credentialStore } from "./credential-store.js";

export const AI_PROVIDER = "openai-codex";
export const AI_RUNTIME = {
	lead: { modelId: "gpt-5.6-sol", reasoning: "high" },
	delegates: {
		modelIds: ["gpt-5.6-terra", "gpt-5.6-sol"],
		reasoning: "high",
		maxConcurrent: 3,
	},
	summaries: { modelId: "gpt-5.6-terra", reasoning: "medium" },
	transport: "auto",
	serviceTier: "default",
} as const;

export const aiModels = createModels({ credentials: credentialStore });
aiModels.setProvider(openaiCodexProvider());

export function requireCodexModel(modelId: string): Model<"openai-codex-responses"> {
	const model = aiModels.getModel(AI_PROVIDER, modelId);
	if (!model || !hasApi(model, "openai-codex-responses")) {
		throw new Error(
			`Required OpenAI Codex model ${modelId} is unavailable. Update Pi before retrying.`,
		);
	}
	return model;
}

export async function assertCodexAuth(): Promise<void> {
	const auth = await aiModels.getAuth(AI_PROVIDER);
	if (!auth) throw new Error("Pi Codex auth missing. Run `pnpm pi:login`.");
}

export async function getAIRuntime(): Promise<AIRuntimeResponse> {
	const [authenticated, lead, summary] = await Promise.all([
		aiModels
			.checkAuth(AI_PROVIDER)
			.then(Boolean)
			.catch(() => false),
		Promise.resolve(requireCodexModel(AI_RUNTIME.lead.modelId)),
		Promise.resolve(requireCodexModel(AI_RUNTIME.summaries.modelId)),
	]);
	for (const modelId of AI_RUNTIME.delegates.modelIds) requireCodexModel(modelId);
	return {
		provider: AI_PROVIDER,
		authenticated,
		roles: {
			lead: { modelId: AI_RUNTIME.lead.modelId, name: lead.name, reasoning: "high" },
			delegates: {
				modelIds: [...AI_RUNTIME.delegates.modelIds],
				reasoning: "high",
				policy: "conditional",
				maxConcurrent: AI_RUNTIME.delegates.maxConcurrent,
			},
			summaries: {
				modelId: AI_RUNTIME.summaries.modelId,
				name: summary.name,
				reasoning: "medium",
			},
		},
		transport: "auto",
		serviceTier: "default",
	};
}

export function codexOptions(reasoning: "medium" | "high"): OpenAICodexResponsesOptions {
	return {
		reasoningEffort: reasoning,
		reasoningSummary: "auto",
		serviceTier: AI_RUNTIME.serviceTier,
		textVerbosity: "low",
	};
}
