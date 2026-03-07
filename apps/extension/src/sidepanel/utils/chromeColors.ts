/**
 * Chrome's actual tab group colors.
 * These match the exact hex values Chrome uses to render collapsed group chips.
 */

export const CHROME_GROUP_COLORS: Record<string, string> = {
	grey: "#5F6368",
	blue: "#1A73E8",
	red: "#D93025",
	yellow: "#F9AB00",
	green: "#188038",
	pink: "#D01884",
	purple: "#A142F4",
	cyan: "#007B83",
	orange: "#FA903E",
};

/** Light-mode backgrounds (Chrome's own light tints) */
const BG_LIGHT: Record<string, string> = {
	grey: "#DADCE0",
	blue: "#D2E3FC",
	red: "#FAD2CF",
	yellow: "#FEF7E0",
	green: "#CEEAD6",
	pink: "#FCDEE8",
	purple: "#E9D2FD",
	cyan: "#D3EDE5",
	orange: "#FEDFC8",
};

/** Dark-mode backgrounds — the Chrome group color at ~15% opacity on dark gray */
const BG_DARK: Record<string, string> = {
	grey: "#2D2E30",
	blue: "#1A2A4A",
	red: "#3A1A18",
	yellow: "#3A2E10",
	green: "#142E1C",
	pink: "#3A1430",
	purple: "#28183A",
	cyan: "#0E2A2C",
	orange: "#3A2410",
};

/** Border-left style using Chrome's actual group color */
export function chromeBorderStyle(color: string): React.CSSProperties {
	return { borderLeftColor: CHROME_GROUP_COLORS[color] || CHROME_GROUP_COLORS.grey };
}

/**
 * Background style that respects the current color scheme.
 * Uses CSS color-mix or a class-based approach won't work with inline styles,
 * so we detect dark mode via matchMedia.
 */
export function chromeBgStyle(color: string, isDark?: boolean): React.CSSProperties {
	const dark =
		isDark ??
		(typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
	const map = dark ? BG_DARK : BG_LIGHT;
	return { backgroundColor: map[color] || map.grey };
}
