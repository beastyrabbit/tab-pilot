import { useCallback, useState } from "react";

const KEY = "tab-orga-test-mode";

export function useTestMode() {
	const [testMode, setTestMode] = useState(() => localStorage.getItem(KEY) === "true");

	const toggle = useCallback(() => {
		setTestMode((prev) => {
			const next = !prev;
			localStorage.setItem(KEY, String(next));
			return next;
		});
	}, []);

	return { testMode, toggle };
}
