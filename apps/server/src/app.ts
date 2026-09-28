import { Hono } from "hono";
import { cors } from "hono/cors";
import { aiRuntimeRoute } from "./routes/ai-runtime.js";
import { contentBridgeRoute } from "./routes/content-bridge.js";
import { debugRoute } from "./routes/debug.js";
import { healthRoute } from "./routes/health.js";
import { memoryRoute } from "./routes/memory.js";
import { organizeRoute } from "./routes/organize.js";
import { rulesRoute } from "./routes/rules.js";
import { settingsRoute } from "./routes/settings.js";
import { storedSetsRoute } from "./routes/stored-sets.js";
import { summarizeRoute } from "./routes/summarize.js";
import { stamp } from "./services/organize-debug-log.js";

export const app = new Hono();
const DEBUG = process.env.TAB_ORGA_DEBUG === "1";
const EXTENSION_ORIGIN = process.env.TAB_ORGA_EXTENSION_ID
	? `chrome-extension://${process.env.TAB_ORGA_EXTENSION_ID}`
	: null;

function allowedCorsOrigin(origin: string): string | undefined {
	if (!origin) return undefined;
	if (EXTENSION_ORIGIN) return origin === EXTENSION_ORIGIN ? origin : undefined;
	if (origin.startsWith("chrome-extension://")) return origin;
	if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return origin;
	return undefined;
}

app.use(
	"*",
	cors({
		origin: allowedCorsOrigin,
		allowMethods: ["GET", "POST", "PUT", "DELETE"],
		allowHeaders: ["Content-Type", "X-Bridge-Token"],
	}),
);

app.use("*", async (c, next) => {
	if (!DEBUG) {
		await next();
		return;
	}

	const startedAt = Date.now();
	const method = c.req.method;
	const path = c.req.path;
	const isNoisyPoll =
		method === "GET" && (path === "/api/health" || path.startsWith("/api/organize/runs/"));
	const requestId = Math.random().toString(36).slice(2, 8);
	if (!isNoisyPoll) {
		console.log(stamp(`[http:${requestId}] --> ${method} ${path}`));
	}
	try {
		await next();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(stamp(`[http:${requestId}] !! ${method} ${path} failed: ${message}`));
		throw error;
	} finally {
		if (!isNoisyPoll) {
			console.log(
				stamp(
					`[http:${requestId}] <-- ${method} ${path} ${c.res.status} ${Date.now() - startedAt}ms`,
				),
			);
		}
	}
});

app.route("/api", healthRoute);
app.route("/api", organizeRoute);
app.route("/api", settingsRoute);
app.route("/api", aiRuntimeRoute);
app.route("/api", rulesRoute);
app.route("/api", memoryRoute);
app.route("/api", storedSetsRoute);
app.route("/api", contentBridgeRoute);
app.route("/api", summarizeRoute);
app.route("/api", debugRoute);
