import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";
import { join } from "path";

const pwd = process.cwd();

test("should import content from another file", async () => {
  const ejb = new Ejb({
    async: false,
    aliases: { "@": join(pwd, 'tests', 'views') },
    resolver: EJBNodeJSResolver(),
  });
  const result = ejb.render('@/main');
  expect(result).toContain("This is imported content.");
  expect(result).toContain("Main content.");
});

test("should handle css directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@head() @css body { color: red; } @end");
  expect(result).toContain("<style>");
  expect(result).toContain("body { color: red; }");
});

test("should handle for directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@for(let i=0;i<3;i++) {{i}} @end", {});
  expect(result).toContain(" 0  1  2 ");
});
