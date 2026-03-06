import { Hono } from "hono";
import { storage } from "../services/storage.js";

export const memoryRoute = new Hono();

memoryRoute.get("/memory", (c) => {
	return c.json(storage.getMemories());
});

memoryRoute.delete("/memory/:id", (c) => {
	const id = c.req.param("id");
	const memories = storage.getMemories();
	const filtered = memories.filter((m) => m.id !== id);
	if (filtered.length === memories.length) return c.json({ error: "Memory not found" }, 404);
	storage.saveMemories(filtered);
	return c.json({ deleted: true });
});

memoryRoute.delete("/memory", (c) => {
	storage.saveMemories([]);
	return c.json({ deleted: true });
});
