export function clientDebug(source: string, message: string, data?: unknown): void {
	console.log(`[${source}] ${message}`, data ?? "");
}
