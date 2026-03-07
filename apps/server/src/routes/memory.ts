import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { aiEditMemories } from "../services/codex.js";
import { storage } from "../services/storage.js";

const AiEditSchema = z.object({
	instruction: z.string().min(1).max(2000),
});

export const memoryRoute = new Hono();

memoryRoute.get("/memory", (c) => {
	return c.json(storage.getMemories());
});

memoryRoute.post("/memory/ai-edit", zValidator("json", AiEditSchema), async (c) => {
	const { instruction } = c.req.valid("json");

	const result = await aiEditMemories(instruction.trim());

	// Apply the AI's edits: keep only the memories it returned, update observations
	const currentMemories = storage.getMemories();
	const updatedMemories = result.memories
		.map((edited) => {
			const existing = currentMemories.find((m) => m.id === edited.id);
			if (!existing) return null;
			return { ...existing, observation: edited.observation };
		})
		.filter((m) => m !== null);

	storage.saveMemories(updatedMemories);
	return c.json({ memories: updatedMemories, summary: result.summary });
});

const UpdateMemorySchema = z.object({
	observation: z.string().min(1).max(2000),
});

memoryRoute.put("/memory/:id", zValidator("json", UpdateMemorySchema), (c) => {
	const id = c.req.param("id");
	const { observation } = c.req.valid("json");
	const memories = storage.getMemories();
	const index = memories.findIndex((m) => m.id === id);
	if (index === -1) return c.json({ error: "Memory not found" }, 404);
	memories[index].observation = observation;
	storage.saveMemories(memories);
	return c.json(memories[index]);
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
