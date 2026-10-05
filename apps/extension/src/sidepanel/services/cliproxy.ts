import type { ModelInfo, PublicSettings } from "@tab-orga/shared";

export function proxyBaseUrl(settings: Pick<PublicSettings, "proxyUrl">): string {
	let url: URL;
	try {
		url = new URL(settings.proxyUrl.trim());
	} catch {
		throw new Error("Enter a complete URL, for example http://127.0.0.1:8317/v1.");
	}
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"Use an HTTP or HTTPS URL without login details, query parameters or fragments.",
		);
	}
	url.pathname = url.pathname.replace(/\/+$/, "") || "/v1";
	return url.toString().replace(/\/$/, "");
}

export async function listProxyModels(
	settings: Pick<PublicSettings, "proxyUrl" | "proxyApiKey">,
): Promise<ModelInfo[]> {
	const endpoint = `${proxyBaseUrl(settings)}/models`;
	let response: Response;
	try {
		response = await fetch(endpoint, {
			headers: settings.proxyApiKey
				? { Authorization: `Bearer ${settings.proxyApiKey}` }
				: undefined,
			signal: AbortSignal.timeout(8000),
			redirect: "error",
		});
	} catch {
		throw new Error(
			"Cannot reach the proxy. Check the address and port, start EasyCLIProxyAPI, and allow network access if it runs on another computer. Key requirements could not be checked.",
		);
	}
	if (response.status === 401)
		throw new Error(
			settings.proxyApiKey
				? "The proxy rejected this key. Copy the client API key configured in EasyCLIProxyAPI."
				: "The proxy requires a key. Copy the client API key from EasyCLIProxyAPI into the field above, then check again.",
		);
	if (response.status === 403)
		throw new Error(
			"The proxy denied access. Check its client API key and network access settings.",
		);
	if (response.status === 404)
		throw new Error(
			"The address responded, but the models endpoint was not found. Use the API base URL, usually ending in /v1, not the management page.",
		);
	if (!response.ok)
		throw new Error(`Proxy error (${response.status}). Check EasyCLIProxyAPI and try again.`);
	const body = await response.json().catch(() => null);
	if (
		!body ||
		!Array.isArray(body.data) ||
		body.data.some(
			(model: unknown) =>
				!model ||
				typeof model !== "object" ||
				!("id" in model) ||
				typeof model.id !== "string" ||
				!model.id.trim(),
		)
	) {
		throw new Error(
			"This address did not return a model list. Use the EasyCLIProxyAPI API base URL, usually ending in /v1.",
		);
	}
	return (body.data as Array<Record<string, unknown> & { id: string; name?: string }>).map(
		(model) => {
			const thinkingLevels = pick(model.thinkingLevels, THINKING_LEVELS);
			const serviceTiers = pick(model.serviceTiers, SERVICE_TIERS);
			return {
				id: model.id,
				name: model.name || model.id,
				...(thinkingLevels ? { thinkingLevels } : {}),
				...(serviceTiers ? { serviceTiers } : {}),
			};
		},
	);
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const SERVICE_TIERS = ["flex", "default", "priority"] as const;

/** Keeps advertised capability values the settings UI understands; undefined means "not advertised". */
function pick<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const valid = value.filter((item): item is T => allowed.includes(item as T));
	return valid.length ? valid : undefined;
}
