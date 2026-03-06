import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

export type ServerStatus = "checking" | "online" | "offline";

export function useServerHealth() {
	const [status, setStatus] = useState<ServerStatus>("checking");
	const [codexConnected, setCodexConnected] = useState(false);

	const check = useCallback(async () => {
		try {
			const health = await serverApi.health();
			setStatus("online");
			setCodexConnected(health.codex);
		} catch {
			setStatus("offline");
			setCodexConnected(false);
		}
	}, []);

	useEffect(() => {
		check();
		const interval = setInterval(check, 30_000);
		return () => clearInterval(interval);
	}, [check]);

	return { status, codexConnected, check };
}
