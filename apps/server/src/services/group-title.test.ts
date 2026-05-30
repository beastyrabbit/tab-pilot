import { describe, expect, it } from "vitest";
import { enforceGroupTitleLength } from "./group-title.js";

describe("enforceGroupTitleLength", () => {
	it("creates two-letter uppercase short titles", () => {
		expect(enforceGroupTitleLength("Bike Research", "short")).toBe("BR");
		expect(enforceGroupTitleLength("GitHub", "short")).toBe("GI");
	});

	it("creates one-word medium titles", () => {
		expect(enforceGroupTitleLength("Bike Research", "medium")).toBe("Bike");
	});

	it("keeps compact multi-word long titles", () => {
		expect(enforceGroupTitleLength("AI Documentation Research Notes", "long")).toBe(
			"AI Documentation Research Notes",
		);
	});
});
