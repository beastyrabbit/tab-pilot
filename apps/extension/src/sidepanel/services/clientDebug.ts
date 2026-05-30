const BASE_URL = "http://127.0.0.1:7777/api";

export function clientDebug(source: string, message: string, data?: unknown): void {
	console.log(`[${source}] ${message}`, data ?? "");
	if (typeof fetch === "undefined") return;
	void fetch(`${BASE_URL}/debug/client`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ source, message, data }),
	}).catch(() => {});
}
