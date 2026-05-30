import { spawnSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = join(repoRoot, "apps", "extension");
const distDir = join(extensionRoot, "dist");
const localDir = join(extensionRoot, ".local");
const keyPath = join(localDir, "tab-pilot.pem");
const crxPath = join(localDir, "tab-pilot.crx");
const localJsonPath = join(localDir, "chromium-external-extension.json");
const updateManifestPath = join(localDir, "updates.xml");
const policyJsonPath = join(localDir, "chromium-managed-policy.json");
const shouldInstallJson = process.argv.includes("--install-json");
const shouldInstallPolicy = process.argv.includes("--install-policy");

function findChromium() {
	if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
	for (const command of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
		const result = spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf-8" });
		if (result.status === 0 && result.stdout.trim()) return command;
	}
	throw new Error("Could not find chromium. Set CHROMIUM_BIN to the Chromium executable.");
}

function extensionIdFromPem(privateKeyPem) {
	const publicDer = createPublicKey(privateKeyPem).export({ type: "spki", format: "der" });
	const digest = createHash("sha256").update(publicDer).digest().subarray(0, 16);
	let id = "";
	for (const byte of digest) {
		id += String.fromCharCode(97 + (byte >> 4));
		id += String.fromCharCode(97 + (byte & 0x0f));
	}
	return id;
}

function shellQuote(value) {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function xmlEscape(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

async function readManifestVersion() {
	const manifestPath = join(distDir, "manifest.json");
	if (!existsSync(manifestPath)) {
		throw new Error("Missing apps/extension/dist/manifest.json. Run pnpm build:extension first.");
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
	if (!manifest.version || typeof manifest.version !== "string") {
		throw new Error("Extension manifest is missing a string version.");
	}
	return manifest.version;
}

async function packExtension(chromium) {
	await mkdir(localDir, { recursive: true });
	const tempRoot = await mkdtemp(join(tmpdir(), "tab-pilot-crx-"));
	const packSource = join(tempRoot, "tab-pilot");

	try {
		await cp(distDir, packSource, { recursive: true });

		const args = [
			`--pack-extension=${packSource}`,
			`--user-data-dir=${join(tempRoot, "profile")}`,
			"--no-message-box",
		];
		if (existsSync(keyPath)) {
			args.push(`--pack-extension-key=${keyPath}`);
		}

		const result = spawnSync(chromium, args, {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		if (result.status !== 0) {
			throw new Error(
				[
					`Chromium failed to pack the extension with status ${result.status}.`,
					result.stdout.trim(),
					result.stderr.trim(),
				]
					.filter(Boolean)
					.join("\n"),
			);
		}

		const packedCrx = `${packSource}.crx`;
		const generatedKey = `${packSource}.pem`;
		if (!existsSync(packedCrx)) {
			throw new Error(`Chromium did not create ${packedCrx}.`);
		}
		await copyFile(packedCrx, crxPath);
		await chmod(crxPath, 0o644);
		if (!existsSync(keyPath)) {
			if (!existsSync(generatedKey)) {
				throw new Error(`Chromium did not create ${generatedKey}.`);
			}
			await copyFile(generatedKey, keyPath);
		}
		await chmod(keyPath, 0o600);
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

async function writeUpdateManifest(extensionId, version) {
	const crxUrl = pathToFileURL(crxPath).href;
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${xmlEscape(extensionId)}">
    <updatecheck codebase="${xmlEscape(crxUrl)}" version="${xmlEscape(version)}" />
  </app>
</gupdate>
`;
	await writeFile(updateManifestPath, xml, "utf-8");
	await chmod(updateManifestPath, 0o644);
	return pathToFileURL(updateManifestPath).href;
}

async function writeExternalJson(extensionId, version) {
	const externalJson = {
		external_crx: crxPath,
		external_version: version,
	};
	const json = `${JSON.stringify(externalJson, null, 2)}\n`;
	await writeFile(localJsonPath, json, "utf-8");
	await chmod(localJsonPath, 0o644);

	if (!shouldInstallJson) return null;

	const installDir = process.env.CHROMIUM_EXTENSION_DIR || "/usr/share/chromium/extensions";
	const installPath = join(installDir, `${extensionId}.json`);
	try {
		await mkdir(installDir, { recursive: true });
		await writeFile(installPath, json, "utf-8");
		return installPath;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const command = `sudo install -Dm644 ${shellQuote(localJsonPath)} ${shellQuote(installPath)}`;
		throw new Error(
			`Could not write ${installPath}: ${message}\nRun this after packing instead:\n${command}`,
		);
	}
}

async function writeManagedPolicy(extensionId, updateUrl) {
	const policy = {
		ExtensionSettings: {
			[extensionId]: {
				installation_mode: "force_installed",
				update_url: updateUrl,
				override_update_url: true,
			},
		},
	};
	const json = `${JSON.stringify(policy, null, 2)}\n`;
	await writeFile(policyJsonPath, json, "utf-8");
	await chmod(policyJsonPath, 0o644);

	if (!shouldInstallPolicy) return null;

	const policyDir = process.env.CHROMIUM_POLICY_DIR || "/etc/chromium/policies/managed";
	const installPath = join(policyDir, "tab-pilot.json");
	try {
		await mkdir(policyDir, { recursive: true });
		await writeFile(installPath, json, "utf-8");
		await chmod(installPath, 0o644);
		return installPath;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const command = `sudo install -Dm644 ${shellQuote(policyJsonPath)} ${shellQuote(installPath)}`;
		throw new Error(
			`Could not write ${installPath}: ${message}\nRun this after packing instead:\n${command}`,
		);
	}
}

try {
	const version = await readManifestVersion();
	const chromium = findChromium();

	await packExtension(chromium);

	const keyPem = await readFile(keyPath, "utf-8");
	const extensionId = extensionIdFromPem(keyPem);
	const updateUrl = await writeUpdateManifest(extensionId, version);
	const installedPath = await writeExternalJson(extensionId, version);
	const installedPolicyPath = await writeManagedPolicy(extensionId, updateUrl);
	const targetJsonPath = join(
		process.env.CHROMIUM_EXTENSION_DIR || "/usr/share/chromium/extensions",
		`${extensionId}.json`,
	);
	const targetPolicyPath = join(
		process.env.CHROMIUM_POLICY_DIR || "/etc/chromium/policies/managed",
		"tab-pilot.json",
	);

	console.log(`Packed ${crxPath}`);
	console.log(`Extension ID: ${extensionId}`);
	console.log(`Manifest version: ${version}`);
	console.log(`Update manifest: ${updateManifestPath}`);
	console.log(`Managed policy JSON: ${policyJsonPath}`);
	console.log(`Local external-install JSON: ${localJsonPath}`);
	if (installedPolicyPath) {
		console.log(`Installed managed policy JSON: ${installedPolicyPath}`);
	} else if (!shouldInstallJson) {
		console.log(
			`Install managed policy JSON with: sudo install -Dm644 ${shellQuote(
				policyJsonPath,
			)} ${shellQuote(targetPolicyPath)}`,
		);
	}
	if (installedPath) {
		console.log(`Installed external-install JSON: ${installedPath}`);
	} else if (shouldInstallJson) {
		console.log(
			`Install external-install JSON with: sudo install -Dm644 ${shellQuote(
				localJsonPath,
			)} ${shellQuote(targetJsonPath)}`,
		);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
