import { Hono } from "hono";
import { nanoid } from "nanoid";
import { storage } from "../services/storage.js";

export const rulesRoute = new Hono();

rulesRoute.get("/rules", (c) => {
	return c.json(storage.getRules());
});

rulesRoute.post("/rules", async (c) => {
	const body = await c.req.json();
	const rules = storage.getRules();
	const newRule = {
		id: nanoid(),
		pattern: body.pattern,
		matchType: body.matchType,
		targetGroup: body.targetGroup,
		color: body.color,
		enabled: body.enabled ?? true,
		createdAt: new Date().toISOString(),
	};
	rules.push(newRule);
	storage.saveRules(rules);
	return c.json(newRule, 201);
});

rulesRoute.put("/rules/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json();
	const rules = storage.getRules();
	const index = rules.findIndex((r) => r.id === id);
	if (index === -1) return c.json({ error: "Rule not found" }, 404);

	rules[index] = { ...rules[index], ...body };
	storage.saveRules(rules);
	return c.json(rules[index]);
});

rulesRoute.delete("/rules/:id", (c) => {
	const id = c.req.param("id");
	const rules = storage.getRules();
	const filtered = rules.filter((r) => r.id !== id);
	if (filtered.length === rules.length) return c.json({ error: "Rule not found" }, 404);
	storage.saveRules(filtered);
	return c.json({ deleted: true });
});
