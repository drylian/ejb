import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { generateNodeCode, generateNodeString, compile } from "../src/compiler";
import { EjbAst } from "../src/constants";

test("should compile text node to string", () => {
  const ejb = new Ejb();
  const result = generateNodeString(ejb, { type: EjbAst.Text, value: "Hello" });
  expect(result).toBe("Hello");
});

test("should compile text node to code", () => {
  const ejb = new Ejb();
  const result = generateNodeCode(ejb, { type: EjbAst.Text, value: "Hello" });
  expect(result).toContain("$ejb.res += `Hello`");
});

test("should compile interpolation node", () => {
  const ejb = new Ejb();
  const result = generateNodeCode(ejb, { 
    type: EjbAst.Interpolation, 
    expression: "name", 
    escaped: true 
  });
  expect(result).toContain("$ejb.res += $ejb.escapeHtml(name)");
});

test("should compile if directive", () => {
  const ejb = new Ejb();
  const ast = ejb.parserAst("@if(true) Hello @end");
  const result = compile(ejb, ast);
  expect(result).toContain("if (true) {");
  expect(result).toContain("$ejb.res += ` Hello `");
  expect(result).toContain("}");
});

test("should compile root node", () => {
  const ejb = new Ejb();
  const ast = { type: EjbAst.Root, children: [] };
  const result = compile(ejb, ast as any);
  expect(result).toContain("return $ejb");
});
