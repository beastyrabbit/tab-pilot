import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

const AUTH_FILE_CANDIDATES = [
	...(process.env.TAB_ORGA_AUTH_FILE ? [resolve(process.env.TAB_ORGA_AUTH_FILE)] : []),
	resolve(process.cwd(), "auth.json"),
	resolve(process.cwd(), "apps/server/auth.json"),
	resolve(import.meta.dirname, "../../auth.json"),
];

function isCredential(value: unknown): value is Credential {
	if (!value || typeof value !== "object") return false;
	const type = (value as { type?: unknown }).type;
	return type === "oauth" || type === "api_key";
}

async function authPath(): Promise<string> {
	for (const candidate of AUTH_FILE_CANDIDATES) {
		try {
			await readFile(candidate, "utf8");
			return candidate;
		} catch {}
	}
	return AUTH_FILE_CANDIDATES[0];
}

async function readCredentials(path: string): Promise<Record<string, Credential>> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, Credential] =>
				isCredential(entry[1]),
			),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error(`Could not read Pi credentials from ${path}`);
	}
}

async function writeCredentials(
	path: string,
	credentials: Record<string, Credential>,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporary, path);
	try {
		await chmod(path, 0o600);
	} catch (error) {
		if (process.platform !== "win32") throw error;
	}
}

export class JsonCredentialStore implements CredentialStore {
	private readonly queues = new Map<string, Promise<void>>();

	constructor(private readonly configuredPath?: string) {}

	private async path(): Promise<string> {
		return this.configuredPath ?? (await authPath());
	}

	private async serialized<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(providerId) ?? Promise.resolve();
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolveGate) => {
			release = resolveGate;
		});
		const tail = previous.catch(() => {}).then(() => gate);
		this.queues.set(providerId, tail);
		await previous.catch(() => {});
		try {
			return await operation();
		} finally {
			release?.();
			if (this.queues.get(providerId) === tail) this.queues.delete(providerId);
		}
	}

	async read(providerId: string): Promise<Credential | undefined> {
		const path = await this.path();
		return (await readCredentials(path))[providerId];
	}

	async list(): Promise<readonly CredentialInfo[]> {
		const path = await this.path();
		const credentials = await readCredentials(path);
		return Object.entries(credentials).map(([providerId, credential]) => ({
			providerId,
			type: credential.type,
		}));
	}

	async modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		return await this.serialized(providerId, async () => {
			const path = await this.path();
			const credentials = await readCredentials(path);
			const next = await fn(credentials[providerId]);
			if (next === undefined) return credentials[providerId];
			credentials[providerId] = next;
			await writeCredentials(path, credentials);
			return next;
		});
	}

	async delete(providerId: string): Promise<void> {
		await this.serialized(providerId, async () => {
			const path = await this.path();
			const credentials = await readCredentials(path);
			if (!(providerId in credentials)) return;
			delete credentials[providerId];
			await writeCredentials(path, credentials);
		});
	}
}

export const credentialStore = new JsonCredentialStore();
