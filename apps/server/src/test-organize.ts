/**
 * Manual test: run with `npx tsx apps/server/src/test-organize.ts`
 * Tests the full organize flow against a live Codex app-server.
 */
import { organizeWithAI } from "./services/codex.js";

const fakeRequest = {
	tabs: [
		{
			id: 1,
			windowId: 1,
			url: "https://github.com/facebook/react",
			title: "React GitHub",
			favIconUrl: "",
			groupId: -1,
		},
		{
			id: 2,
			windowId: 1,
			url: "https://github.com/vercel/next.js",
			title: "Next.js GitHub",
			favIconUrl: "",
			groupId: -1,
		},
		{
			id: 3,
			windowId: 1,
			url: "https://www.youtube.com/watch?v=abc",
			title: "Funny Cat Video",
			favIconUrl: "",
			groupId: -1,
		},
		{
			id: 4,
			windowId: 1,
			url: "https://www.youtube.com/watch?v=xyz",
			title: "Music Playlist",
			favIconUrl: "",
			groupId: -1,
		},
		{
			id: 5,
			windowId: 1,
			url: "https://news.ycombinator.com",
			title: "Hacker News",
			favIconUrl: "",
			groupId: -1,
		},
		{
			id: 6,
			windowId: 1,
			url: "https://docs.python.org/3/",
			title: "Python Docs",
			favIconUrl: "",
			groupId: -1,
		},
	],
	existingGroups: [],
	contentDepth: "title-url" as const,
};

console.log("Testing organize with 6 fake tabs...\n");

try {
	const result = await organizeWithAI(fakeRequest);
	console.log("\nResult:");
	console.log(JSON.stringify(result, null, 2));
	process.exit(0);
} catch (e) {
	console.error("\nFailed:", e);
	process.exit(1);
}
