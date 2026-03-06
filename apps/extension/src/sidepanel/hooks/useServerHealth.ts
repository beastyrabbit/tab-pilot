import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

export type ServerStatus = "checking" | "online" | "offline";

export function useServerHealth() {
	const [status, setStatus] = useState<ServerStatus>("checking");

	const check = useCallback(async () => {
		try {
			await serverApi.health();
			setStatus("online");
		} catch {
			setStatus("offline");
		}
	}, []);

	useEffect(() => {
		check();
		const interval = setInterval(check, 30_000);
		return () => clearInterval(interval);
	}, [check]);

	return { status, check };
}
