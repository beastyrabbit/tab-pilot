import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { storage } from "../services/storage.js";

const GroupColorSchema = z.enum([
	"grey",
	"blue",
	"red",
	"yellow",
	"green",
	"pink",
	"purple",
	"cyan",
	"orange",
]);

const StoredTabInputSchema = z.object({
	originalUrl: z.string().min(1).max(5000),
	title: z.string().max(1000),
	favIconUrl: z.string().max(5000).optional(),
	metadata: z
		.object({
			metaDescription: z.string().max(5000).optional(),
			ogDescription: z.string().max(5000).optional(),
			keywords: z.string().max(5000).optional(),
		})
		.optional(),
	stage1Summary: z.string().max(5000).optional(),
	stage2Summary: z.string().max(5000).optional(),
});

const CreateStoredSetSchema = z.object({
	name: z.string().min(1).max(200),
	color: GroupColorSchema.optional(),
	summary: z.string().max(5000).optional(),
	tabs: z.array(StoredTabInputSchema).min(1).max(1000),
});

const AppendStoredTabsSchema = z.object({
	tabs: z.array(StoredTabInputSchema).min(1).max(1000),
});

export const storedSetsRoute = new Hono();

storedSetsRoute.get("/stored-sets", (c) => {
	return c.json({ sets: storage.listStoredTabSets() });
});

storedSetsRoute.post("/stored-sets", zValidator("json", CreateStoredSetSchema), (c) => {
	try {
		const set = storage.createStoredTabSet(c.req.valid("json"));
		return c.json({ set }, 201);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to store tabs";
		return c.json({ error: message }, 400);
	}
});

storedSetsRoute.get("/stored-sets/:id", (c) => {
	const set = storage.getStoredTabSet(c.req.param("id"));
	if (!set) return c.json({ error: "Stored set not found" }, 404);
	return c.json({ set });
});

storedSetsRoute.get("/stored-sets/:id/restore", (c) => {
	const set = storage.getStoredTabSet(c.req.param("id"));
	if (!set) return c.json({ error: "Stored set not found" }, 404);
	return c.json({ set });
});

storedSetsRoute.post("/stored-sets/:id/tabs", zValidator("json", AppendStoredTabsSchema), (c) => {
	const set = storage.appendStoredTabs(c.req.param("id"), c.req.valid("json").tabs);
	if (!set) return c.json({ error: "Stored set not found" }, 404);
	return c.json({ set });
});

storedSetsRoute.delete("/stored-sets/:id", (c) => {
	const deleted = storage.deleteStoredTabSet(c.req.param("id"));
	if (!deleted) return c.json({ error: "Stored set not found" }, 404);
	return c.json({ deleted: true });
});
