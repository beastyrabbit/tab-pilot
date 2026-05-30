import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const distEntry = join(serverRoot, "dist", "index.js");

function trimOutput(text) {
	const maxLength = 4000;
	return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

async function availablePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.unref();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (!address || typeof address === "string") {
				probe.close(() => reject(new Error("Could not allocate a smoke-test port.")));
				return;
			}
			probe.close(() => resolve(address.port));
		});
	});
}

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, child, output) {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(
				`Server exited before health check passed.\n\nstdout:\n${trimOutput(
					output.stdout,
				)}\n\nstderr:\n${trimOutput(output.stderr)}`,
			);
		}

		try {
			const response = await fetch(url);
			if (response.ok) {
				const body = await response.json();
				if (body.status === "ok") return;
			}
		} catch {}

		await wait(250);
	}

	throw new Error(
		`Timed out waiting for ${url}.\n\nstdout:\n${trimOutput(output.stdout)}\n\nstderr:\n${trimOutput(
			output.stderr,
		)}`,
	);
}

const dataDir = await mkdtemp(join(tmpdir(), "tab-orga-smoke-"));
const port = await availablePort();
const childOutput = { stdout: "", stderr: "" };

const child = spawn(process.execPath, [distEntry], {
	cwd: serverRoot,
	env: {
		...process.env,
		TAB_ORGA_DEBUG: "0",
		TAB_ORGA_HOST: "127.0.0.1",
		TAB_ORGA_PORT: String(port),
		TAB_ORGA_DATA_DIR: dataDir,
	},
	stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
	childOutput.stdout += chunk;
});

child.stderr.on("data", (chunk) => {
	childOutput.stderr += chunk;
});

try {
	await waitForHealth(`http://127.0.0.1:${port}/api/health`, child, childOutput);
	console.log(`Production server smoke check passed on port ${port}.`);
} finally {
	if (child.exitCode === null) {
		child.kill("SIGTERM");
		await Promise.race([
			new Promise((resolve) => child.once("exit", resolve)),
			wait(2_000).then(() => child.kill("SIGKILL")),
		]);
	}
	await rm(dataDir, { recursive: true, force: true });
}
