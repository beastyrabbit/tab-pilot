import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/extension/dist");
const outputDir = resolve(root, "apps/extension/.local");
const output = resolve(outputDir, "tab-organizer-store.zip");
mkdirSync(outputDir, { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-qr", output, "."], { cwd: dist });
console.log(output);
