import { useCallback, useEffect, useState } from "react";

export type ServerStatus = "checking" | "online" | "offline";

export function useServerHealth() {
	const [status, setStatus] = useState<ServerStatus>("checking");
	const [codexConnected, setCodexConnected] = useState(false);

	const check = useCallback(async () => {
		try {
			const stored = await chrome.storage.local.get("tab-orga-settings");
			const url = (
				(stored["tab-orga-settings"] as { proxyUrl?: string } | undefined)?.proxyUrl ||
				"http://127.0.0.1:8317/v1"
			).replace(/\/$/, "");
			const key = (stored["tab-orga-settings"] as { proxyApiKey?: string } | undefined)
				?.proxyApiKey;
			const response = await fetch(`${url}/models`, {
				headers: key ? { Authorization: `Bearer ${key}` } : undefined,
			});
			if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
			setStatus("online");
			setCodexConnected(true);
		} catch {
			setStatus("offline");
			setCodexConnected(false);
		}
	}, []);

	useEffect(() => {
		check();
		const interval = setInterval(check, status === "online" ? 10_000 : 2_000);
		return () => clearInterval(interval);
	}, [check, status]);

	useEffect(() => {
		const onFocus = () => {
			void check();
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void check();
		};

		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [check]);

	return { status, codexConnected, check };
}
