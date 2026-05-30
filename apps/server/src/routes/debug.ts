import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const ClientDebugSchema = z.object({
	source: z.string().min(1).max(100),
	message: z.string().min(1).max(1000),
	data: z.unknown().optional(),
});

export const debugRoute = new Hono();

debugRoute.post("/debug/client", zValidator("json", ClientDebugSchema), (c) => {
	if (process.env.TAB_ORGA_DEBUG !== "1") {
		return c.json({ ok: true });
	}
	const { source, message, data } = c.req.valid("json");
	const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
	console.log(`[client:${source}] ${message}${suffix}`);
	return c.json({ ok: true });
});
