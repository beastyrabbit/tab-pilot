import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { memoryRoute } from "./routes/memory.js";
import { modelsRoute } from "./routes/models.js";
import { organizeRoute } from "./routes/organize.js";
import { rulesRoute } from "./routes/rules.js";
import { settingsRoute } from "./routes/settings.js";

export const app = new Hono();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE"],
	}),
);

app.route("/api", healthRoute);
app.route("/api", organizeRoute);
app.route("/api", settingsRoute);
app.route("/api", modelsRoute);
app.route("/api", rulesRoute);
app.route("/api", memoryRoute);
