import { Ejb, ejbDirective } from "../../src/index";
import { describe, expect, it } from "bun:test";

describe("Regex Directives", () => {
	it("should replace a self-closing tag-like directive", async () => {
		const ejb = new Ejb();

		const regexDirective = ejbDirective({
			name: /<x-([a-zA-Z0-9-]+)\s*\/>/,
			onNameResolver: (_, match) => {
				const componentName = match[1];
				return `REPLACED-${componentName}`;
			},
		});

		ejb.register(regexDirective);

		const template = "before <x-my-component /> after";
		const expected = "before REPLACED-my-component after";

		const result = await ejb.render(template);
		expect(result).toBe(expected);
	});

	it("should replace a block tag-like directive", async () => {
		const ejb = new Ejb();

		const regexDirective = ejbDirective({
			name: /<x-([a-zA-Z0-9-]+)>(.*?)<\/x-\1>/s,
			onNameResolver: (_, match) => {
				const componentName = match[1];
				const content = match[2];
				return `<div>${componentName}: ${content}</div>`;
			},
		});

		ejb.register(regexDirective);

		const template = "before <x-my-card>inner content</x-my-card> after";
		const expected = "before <div>my-card: inner content</div> after";

		const result = await ejb.render(template);
		expect(result).toBe(expected);
	});
});
