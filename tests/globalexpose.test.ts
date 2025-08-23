import { Ejb } from "../src/index";
import { describe, expect, it } from "bun:test";

describe("globalexpose feature", () => {
	it("should expose global variables directly when globalexpose is true (default)", () => {
		const ejb = new Ejb({
			globals: {
				myVar: "world",
			},
		});

		const template = "Hello {{ myVar }}";
		const result = ejb.render(template);
		expect(result).toBe("Hello world");
	});

	it("should not expose global variables directly when globalexpose is false", () => {
		const ejb = new Ejb({
			globalexpose: false,
			globals: {
				myVar: "world",
			},
		});

		const template = "Hello {{ myVar }}";
				expect(() => ejb.render(template)).toThrow(ReferenceError);

		const template2 = "Hello {{ it.myVar }}";
		const result = ejb.render(template2);
		expect(result).toBe("Hello world");
	});

	it("should not throw error for undefined variable when globalexpose is false", () => {
		const ejb = new Ejb({
			globalexpose: false,
			globals: {
				myVar: "world",
			},
		});
		const template = "Hello {{ myOtherVar }}";
				expect(() => ejb.render(template)).toThrow(ReferenceError);
	});
});
