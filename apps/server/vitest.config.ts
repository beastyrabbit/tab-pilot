import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

const dataDir = process.env.TAB_ORGA_DATA_DIR ?? mkdtempSync(join(tmpdir(), "tab-orga-test-"));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		env: {
			TAB_ORGA_DATA_DIR: dataDir,
		},
	},
});
