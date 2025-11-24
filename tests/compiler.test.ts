import { expect, test } from "bun:test";
import { compile, generateNodeCode, generateNodeString } from "../src/compiler";
import { EjbAst } from "../src/constants";
import { Ejb } from "../src/ejb";

test("should compile text node to string", () => {
	const ejb = new Ejb();
	const result = generateNodeString(ejb, { type: EjbAst.Text, value: "Hello" });
	expect(result).toBe("Hello");
});

test("should compile text node to code", async () => {
	const ejb = new Ejb();
	const result = await generateNodeCode(ejb, { type: EjbAst.Text, value: "Hello" });
	expect(result).toContain("$ejb.res += `Hello`;");
});

test("should compile interpolation node", async () => {
	const ejb = new Ejb();
	const result = await generateNodeCode(ejb, {
		type: EjbAst.Interpolation,
		expression: "name",
		escaped: true,
	});
	expect(result).toContain("$ejb.res += $ejb.escapeHtml(name)");
});

test("should compile if directive", async () => {
	const ejb = new Ejb();
	const ast = ejb.parser(`
    @if(true) Hello @end`);
	const result = await ejb.compile(ast);
	expect(result).toContain("if (true) {");
	expect(result).toContain("$ejb.res += ` Hello `");
	expect(result).toContain("}");
});

test("should compile root node", async () => {
	const ejb = new Ejb();
	const ast = { type: EjbAst.Root, children: [] };
	const result = await compile(ejb, ast as any);
	expect(result).toContain("return $ejb");
});

test("should handle compilation", async () => {
	const ejb = new Ejb();
	const ast = ejb.parser("Hello");
	const result = await compile(ejb, ast);
	expect(result).toContain("$ejb.res += `Hello`;");
});
