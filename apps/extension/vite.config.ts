import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		react(),
		{
			name: "copy-manifest",
			writeBundle() {
				copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
			},
		},
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
				"service-worker": resolve(__dirname, "src/background/service-worker.ts"),
				extractor: resolve(__dirname, "src/content/extractor.ts"),
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash][extname]",
			},
		},
	},
});
