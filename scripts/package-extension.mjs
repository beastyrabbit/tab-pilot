import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Resolve zip from fixed system locations instead of trusting PATH.
const zip = ["/usr/bin/zip", "/usr/local/bin/zip", "/opt/homebrew/bin/zip"].find((candidate) =>
	existsSync(candidate),
);
if (!zip) throw new Error("zip not found in /usr/bin, /usr/local/bin or /opt/homebrew/bin");

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/extension/dist");
const outputDir = resolve(root, "apps/extension/.local");
const output = resolve(outputDir, "tab-organizer-store.zip");
mkdirSync(outputDir, { recursive: true });
rmSync(output, { force: true });
execFileSync(zip, ["-qr", output, "."], { cwd: dist });
console.log(output);
