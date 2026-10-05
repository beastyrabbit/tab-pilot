import { afterEach, describe, expect, it, vi } from "vitest";
import { listProxyModels, proxyBaseUrl } from "./cliproxy.js";

const settings = { proxyUrl: "http://proxy.test:8317/v1", proxyApiKey: "" };
afterEach(() => vi.unstubAllGlobals());

describe("proxy setup", () => {
	it("normalizes a bare host and preserves custom API paths", () => {
		expect(proxyBaseUrl({ proxyUrl: " http://proxy.test:8317/ " })).toBe(settings.proxyUrl);
		expect(proxyBaseUrl({ proxyUrl: "https://proxy.test/custom/v1///" })).toBe(
			"https://proxy.test/custom/v1",
		);
	});
	it.each([
		"proxy.test",
		"file:///tmp/proxy",
		"https://user:password@proxy.test",
		"https://proxy.test?key=value",
	])("rejects invalid or credential-bearing addresses before requesting: %s", async (proxyUrl) => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		await expect(listProxyModels({ ...settings, proxyUrl })).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});
	it("loads advertised models using the configured proxy key", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b", name: "Model B" }] }),
				),
			);
		vi.stubGlobal("fetch", fetch);
		expect(await listProxyModels({ ...settings, proxyApiKey: "test-only-placeholder" })).toEqual([
			{ id: "model-a", name: "model-a" },
			{ id: "model-b", name: "Model B" },
		]);
		expect(fetch).toHaveBeenCalledWith(
			`${settings.proxyUrl}/models`,
			expect.objectContaining({
				headers: { Authorization: "Bearer test-only-placeholder" },
				redirect: "error",
			}),
		);
	});
	it.each([
		[401, "requires a key"],
		[403, "denied access"],
		[404, "ending in /v1"],
		[500, "Proxy error"],
	])("explains HTTP %s", async (status, message) => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })),
		);
		await expect(listProxyModels(settings)).rejects.toThrow(String(message));
	});
	it("distinguishes a rejected key from a missing key", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
		await expect(
			listProxyModels({ ...settings, proxyApiKey: "test-only-placeholder" }),
		).rejects.toThrow("rejected this key");
	});
	it("explains network failures without pretending auth was checked", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		await expect(listProxyModels(settings)).rejects.toThrow(
			"Key requirements could not be checked",
		);
	});
	it.each([
		"<html>management page</html>",
		JSON.stringify({ other: [] }),
		JSON.stringify({ data: [null] }),
	])("rejects non-model responses", async (body) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
		await expect(listProxyModels(settings)).rejects.toThrow("did not return a model list");
	});
	it("preserves an empty model list for the account-setup message", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"data":[]}')));
		expect(await listProxyModels(settings)).toEqual([]);
	});
});
