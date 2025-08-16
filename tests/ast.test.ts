import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { EjbAst } from "../src/constants";

test("should parse simple text", () => {
  const ejb = new Ejb();
  const ast = ejb.parserAst("Hello World");
  expect(ast.type).toBe(EjbAst.Root);
  expect(ast.children.length).toBe(1);
  expect(ast.children[0].type).toBe(EjbAst.Text);
  expect((ast.children[0] as any).value).toBe("Hello World");
});

test("should parse interpolation", () => {
  const ejb = new Ejb();
  const ast = ejb.parserAst("Hello {{name}}");
  expect(ast.children.length).toBe(2);
  expect(ast.children[1].type).toBe(EjbAst.Interpolation);
  expect((ast.children[1] as any).expression).toBe("name");
});

test("should parse directives", () => {
  const ejb = new Ejb();
  const ast = ejb.parserAst("@if(true) Hello @end");
  expect(ast.children.length).toBe(1);
  expect(ast.children[0].type).toBe(EjbAst.Directive);
  expect((ast.children[0] as any).name).toBe("if");
  expect((ast.children[0] as any).expression).toBe("true");
});

test("should throw on unclosed directive", () => {
  const ejb = new Ejb();
  expect(ejb.parserAst("@if(true) Hello")).toEqual({
    type: EjbAst.Root,
    children: [
      {
        type: 3,
        name: "if",
        expression: "true",
        children: [
          {
            type: 1,
            value: " Hello",
          }
        ],
        autoClosed: true,
      }
    ],
  });
});

test("should parse nested directives", () => {
  const ejb = new Ejb();
  const ast = ejb.parserAst("@if(true) @for(item in list) Loop @end @end");
  expect(ast.children.length).toBe(1);
  const ifNode = ast.children[0] as any;
  expect(ifNode.children.length).toBe(3); // Text + for directive + Text
  expect(ifNode.children[1].type).toBe(EjbAst.Directive);
});
