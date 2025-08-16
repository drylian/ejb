import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";

test("should render simple template", () => {
  const ejb = new Ejb();
  const result = ejb.render("Hello {{it.name}}", { name: "World" });
  expect(result).toBe("Hello World");
});

test("should handle if directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@if(it.show) Hello", { show: true });
  expect(result).toBe(" Hello ");
});

test("should handle async operations", async () => {
  const ejb = new Ejb({ async: true });
  const result = await ejb.render("Hello {{it.name}}", { name: "World" });
  expect(result).toBe("Hello World");
});

test("should throw on async in sync mode", () => {
  const ejb = new Ejb({
    //@ts-expect-error simulate error resolver
    resolver: async () => "",
  });
  expect(() => ejb.render("./template.ejb"))
    .toThrow("[EJB] Async template loading in sync mode");
});

test("should register custom directives", () => {
  const ejb = new Ejb().register({
    name: "custom",
    onParams: () => "$ejb.res +='CUSTOM_CODE';",
  });
  const result = ejb.render("@custom()");
  console.log(result)
  expect(result).toInclude("CUSTOM_CODE");
});

test("should determine if a string is a template path", () => {
    const ejb = new Ejb();
    expect(ejb['isTemplatePath']('path/to/template.ejb')).toBe(true);
    expect(ejb['isTemplatePath']('Hello {{it.name}}')).toBe(false);
    expect(ejb['isTemplatePath']('@if(true) Hello @end')).toBe(false);
});

test("should compile node", () => {
    const ejb = new Ejb();
    const ast = ejb.parserAst("Hello World");
    const result = ejb.compileNode(ast);
    expect(result).toContain("$ejb.res += `Hello World`;");
});
