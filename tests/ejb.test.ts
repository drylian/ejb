import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";
import { join } from "path";

test("should render simple template", () => {
  const ejb = new Ejb();
  const result = ejb.render("Hello {{it.name}}", { name: "World" });
  expect(result).toBe("Hello World");
});

test("should handle if directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@if(it.show) Hello @end", { show: true });
  expect(result).toBe(" Hello ");
});

test("should handle async operations", async () => {
  const ejb = new Ejb({ async: true });
  const result = await ejb.render("Hello {{it.name}}", { name: "World" });
  expect(result).toBe("Hello World");
});

test("should throw on async in sync mode", () => {
  const ejb = new Ejb();
  expect(() => ejb.render("Hello {{name}}", { name: "World" }))
    .toThrow("name is not defined");
});

test("should register custom directives", () => {
  const ejb = new Ejb().register({
    name: "custom",
    onParams: () => "$ejb.res +='CUSTOM_CODE';",
  });
  const result = ejb.render("@custom()");
  expect(result).toInclude("CUSTOM_CODE");
});
