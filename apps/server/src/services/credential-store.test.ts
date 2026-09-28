import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonCredentialStore } from "./credential-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function testStore() {
	const directory = await mkdtemp(join(tmpdir(), "tab-orga-auth-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "auth.json");
	return { path, store: new JsonCredentialStore(path) };
}

describe("JsonCredentialStore", () => {
	it("persists credentials without exposing them from list", async () => {
		const { path, store } = await testStore();
		await store.modify("openai-codex", async () => ({
			type: "oauth",
			access: "access-secret",
			refresh: "refresh-secret",
			expires: Date.now() + 60_000,
		}));

		expect(await store.list()).toEqual([{ providerId: "openai-codex", type: "oauth" }]);
		expect(await store.read("openai-codex")).toMatchObject({ type: "oauth" });
		expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
			"openai-codex": { type: "oauth", access: "access-secret" },
		});
	});

	it("serializes concurrent refreshes and supports deletion", async () => {
		const { store } = await testStore();
		await store.modify("openai-codex", async () => ({ type: "api_key", key: "first" }));
		await Promise.all([
			store.modify("openai-codex", async (current) => ({
				...(current?.type === "api_key" ? current : { type: "api_key" as const }),
				key: `${current?.type === "api_key" ? current.key : ""}-second`,
			})),
			store.modify("openai-codex", async (current) => ({
				...(current?.type === "api_key" ? current : { type: "api_key" as const }),
				key: `${current?.type === "api_key" ? current.key : ""}-third`,
			})),
		]);

		expect(await store.read("openai-codex")).toMatchObject({ key: "first-second-third" });
		await store.delete("openai-codex");
		expect(await store.read("openai-codex")).toBeUndefined();
	});

	it("serializes whole-file updates across store instances", async () => {
		const { path, store: firstStore } = await testStore();
		const secondStore = new JsonCredentialStore(path);
		let releaseFirst: (() => void) | undefined;
		const holdFirst = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let firstStarted: (() => void) | undefined;
		const firstIsRunning = new Promise<void>((resolve) => {
			firstStarted = resolve;
		});

		const firstWrite = firstStore.modify("provider-one", async () => {
			firstStarted?.();
			await holdFirst;
			return { type: "api_key", key: "first" };
		});
		await firstIsRunning;
		const secondWrite = secondStore.modify("provider-two", async () => ({
			type: "api_key",
			key: "second",
		}));
		releaseFirst?.();
		await Promise.all([firstWrite, secondWrite]);

		expect(await firstStore.list()).toEqual([
			{ providerId: "provider-one", type: "api_key" },
			{ providerId: "provider-two", type: "api_key" },
		]);
	});
});
