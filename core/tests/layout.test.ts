import { describe, expect, it } from "bun:test";
import { Kire } from "../src/kire";

describe("Layout Directives", () => {
	it("should render a layout with parameters", async () => {
		const kire = new Kire();

		// Mock resolver
		kire.resolverFn = async (path) => {
			if (path.includes("layout")) return `<h1>{{ title }}</h1>`;
			return "";
		};

		const template = `@include('layout', { title: 'Hello Layout' })`;
		const result = await kire.render(template);

		expect(result).toBe("<h1>Hello Layout</h1>");
	});

	it("should render a layout with implicit locals", async () => {
		const kire = new Kire();

		// Mock resolver
		kire.resolverFn = async (path) => {
			// Accessing 'title' directly implies it's in the scope
			// Kire render merges locals into the scope.
			if (path.includes("layout")) return `<h1>{{ title }}</h1>`;
			return "";
		};

		const template = `@include('layout', { title: 'Implicit' })`;
		const result = await kire.render(template);

		expect(result).toBe("<h1>Implicit</h1>");
	});
});
