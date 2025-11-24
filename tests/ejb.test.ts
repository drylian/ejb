import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";

test("should render simple template", async () => {
	const ejb = new Ejb();
	const result = await ejb.render("Hello {{it.name}}", { name: "World" });
	expect(result).toBe("Hello World");
});

test("should handle if directive", async () => {
	const ejb = new Ejb();
	const result = await ejb.render("@if(it.show) Hello", { show: true });
	expect(result).toBe(" Hello");
});

test("should handle async operations", async () => {
	const ejb = new Ejb();
	const result = await ejb.render("Hello {{it.name}}", { name: "World" });
	expect(result).toBe("Hello World");
});

test("should register custom directives", async () => {
	const ejb = new Ejb().register({
		name: "custom",
		onParams: () => "$ejb.res +='CUSTOM_CODE';",
	});
	const result = await ejb.render("@custom()");
	expect(result).toContain("CUSTOM_CODE");
});

test("should determine if a string is a template path", () => {
	const ejb = new Ejb();
	expect(ejb["isTemplatePath"]("path/to/template.ejb")).toBe(true);
	expect(ejb["isTemplatePath"]("Hello {{it.name}}")).toBe(false);
	expect(ejb["isTemplatePath"]("@if(true) Hello @end")).toBe(false);
});

test("should compile node", async () => {
	const ejb = new Ejb();
	const ast = ejb.parser("Hello World");
	const result = await ejb.compile(ast);
	expect(result).toContain("$ejb.res += `Hello World`;");
});
