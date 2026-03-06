import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = 7777;
console.log(`Tab Organizer server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
