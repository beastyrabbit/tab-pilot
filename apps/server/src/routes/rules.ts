import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { storage } from "../services/storage.js";

export const rulesRoute = new Hono();

const RuleInputSchema = z
	.object({
		pattern: z.string().min(1).max(2_000),
		matchType: z.enum(["url-contains", "domain", "title-contains", "regex"]),
		targetGroup: z.string().min(1).max(100),
		color: z
			.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"])
			.optional(),
		enabled: z.boolean().optional(),
	})
	.strict();

const RuleUpdateSchema = RuleInputSchema.partial();

rulesRoute.get("/rules", (c) => {
	return c.json(storage.getRules());
});

rulesRoute.post("/rules", zValidator("json", RuleInputSchema), (c) => {
	const body = c.req.valid("json");
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

rulesRoute.put("/rules/:id", zValidator("json", RuleUpdateSchema), (c) => {
	const id = c.req.param("id");
	const body = c.req.valid("json");
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
