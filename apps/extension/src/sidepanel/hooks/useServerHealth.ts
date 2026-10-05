import { useCallback, useEffect, useRef, useState } from "react";

export type ServerStatus = "checking" | "online" | "offline";

export function useServerHealth() {
	const [status, setStatus] = useState<ServerStatus>("checking");
	const [codexConnected, setCodexConnected] = useState(false);

	const inFlight = useRef(false);

	const check = useCallback(async () => {
		// An unreachable proxy must not pile up requests from the polling interval.
		if (inFlight.current) return;
		inFlight.current = true;
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
				signal: AbortSignal.timeout(5_000),
				redirect: "error",
			});
			if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
			setStatus("online");
			setCodexConnected(true);
		} catch {
			setStatus("offline");
			setCodexConnected(false);
		} finally {
			inFlight.current = false;
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
