import { expect, test } from "bun:test";
import { EjbAst } from "../src/constants";
import { Ejb } from "../src/ejb";
import { ejbParser } from "../src/parser";

test("should parse simple text", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "Hello World");
	expect(ast.type).toBe(EjbAst.Root);
	expect(ast.children.length).toBe(1);
	expect(ast.children[0].type).toBe(EjbAst.Text);
});

test("should parse interpolation", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "Hello {{ name }}");
	expect(ast.children.length).toBe(2);
	expect(ast.children[1].type).toBe(EjbAst.Interpolation);
});

test("should parse directives", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "@if(true)Hello@end");
	expect(ast.children.length).toBe(1);
	expect(ast.children[0].type).toBe(EjbAst.Directive);
});

test("should handle unclosed directives", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "@if(true)Hello");
	const directive = ast.children[0] as any;
	expect(directive.auto_closed).toBe(true);
});

test("should handle nested directives", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "@if(true)@for(i in items)Hello@end@end");
	const ifNode = ast.children[0] as any;
	expect(ifNode.children[0].type).toBe(EjbAst.Directive);
});

test("should collect error on invalid directive", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "@");
	expect(ast.errors.length).toBe(1);
	expect(ast.errors[0].message).toBe("Invalid directive");
});

test("should collect error on unexpected end directive", () => {
	const ejb = new Ejb();
	const ast = ejbParser(ejb, "@end");
	expect(ast.errors.length).toBe(1);
	expect(ast.errors[0].message).toBe("Unexpected @end directive");
});
