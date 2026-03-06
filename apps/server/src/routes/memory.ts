import { Hono } from "hono";
import { aiEditMemories } from "../services/codex.js";
import { storage } from "../services/storage.js";

export const memoryRoute = new Hono();

memoryRoute.get("/memory", (c) => {
	return c.json(storage.getMemories());
});

memoryRoute.post("/memory/ai-edit", async (c) => {
	const body = await c.req.json();
	const instruction = body.instruction;
	if (typeof instruction !== "string" || !instruction.trim()) {
		return c.json({ error: "instruction is required" }, 400);
	}

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

memoryRoute.put("/memory/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json();
	const memories = storage.getMemories();
	const index = memories.findIndex((m) => m.id === id);
	if (index === -1) return c.json({ error: "Memory not found" }, 404);
	if (typeof body.observation === "string") {
		memories[index].observation = body.observation;
	}
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
