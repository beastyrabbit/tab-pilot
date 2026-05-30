import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { timestamp } from "./services/organize-debug-log.js";

const port = 7777;
const hostname = process.env.TAB_ORGA_HOST || "127.0.0.1";
const server = serve({ fetch: app.fetch, hostname, port });
const debug = process.env.TAB_ORGA_DEBUG === "1";

if (debug) {
	for (const level of ["log", "warn", "error"] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			if (typeof args[0] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(args[0])) {
				original(...args);
				return;
			}
			original(timestamp(), ...args);
		};
	}
}

server.on("listening", () => {
	console.log(`Tab Organizer server running on http://${hostname}:${port}`);
	if (debug) {
		console.log(
			`[debug] pid=${process.pid} node=${process.version} cwd=${process.cwd()} TAB_ORGA_DEBUG=1`,
		);
		console.log(
			"[debug] Request logging enabled. Click Organize and watch for POST /api/organize.",
		);
	}
});

server.on("error", (error: NodeJS.ErrnoException) => {
	if (error.code === "EADDRINUSE") {
		console.error(
			`Port ${port} is already in use. Stop the existing server or use the one already running at http://${hostname}:${port}.`,
		);
		process.exit(1);
	}
	throw error;
});
