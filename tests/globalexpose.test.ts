import { Ejb } from "../src/index";
import { describe, expect, it } from "bun:test";

describe("globalexpose feature", () => {
	it("should expose global variables directly when globalexpose is true (default)", async () => {
		const ejb = new Ejb({
			globals: {
				myVar: "world",
			},
		});

		const template = "Hello {{ myVar }}";
		const result = await ejb.render(template);
		expect(result).toBe("Hello world");
	});

	it("should not expose global variables directly when globalexpose is false", async () => {
		const ejb = new Ejb({
			globalexpose: false,
			globals: {
				myVar: "world",
			},
		});

		const template = "Hello {{ myVar }}";
		await expect(ejb.render(template)).rejects.toThrow(ReferenceError);

		const template2 = "Hello {{ it.myVar }}";
		const result = await ejb.render(template2);
		expect(result).toBe("Hello world");
	});

	it("should not throw error for undefined variable when globalexpose is false", async () => {
		const ejb = new Ejb({
			globalexpose: false,
			globals: {
				myVar: "world",
			},
		});
		const template = "Hello {{ myOtherVar }}";
		await expect(ejb.render(template)).rejects.toThrow(ReferenceError);
	});
});
