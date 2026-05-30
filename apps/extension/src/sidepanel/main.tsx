import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

window.addEventListener("unhandledrejection", (event) => {
	const reason = event.reason;
	if (
		reason instanceof Error &&
		(reason.name === "ServerOfflineError" || reason.message === "Failed to fetch")
	) {
		event.preventDefault();
	}
});

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
