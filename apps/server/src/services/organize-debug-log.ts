import { appendFileSync } from "node:fs";

export const ORGANIZE_DEBUG_LOG_FILE =
	process.env.TAB_ORGA_ORGANIZE_LOG_FILE || "/tmp/tab-orga-organize.log";

export function timestamp(): string {
	return new Date().toISOString();
}

export function stamp(message: string): string {
	return `${timestamp()} ${message}`;
}

export function organizeDebugLog(runId: string, message: string, data?: unknown): void {
	if (process.env.TAB_ORGA_DEBUG !== "1") return;
	const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
	const line = stamp(`[organize:${runId}] ${message}${suffix}`);
	try {
		appendFileSync(ORGANIZE_DEBUG_LOG_FILE, `${line}\n`);
	} catch {}
	console.log(line);
}
