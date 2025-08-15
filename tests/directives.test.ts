import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";
import { join } from "path";

const pwd = process.cwd();

test("should import content from another file using @import", async () => {
  const ejb = new Ejb({
    async: false,
    aliases: { "@": join(pwd, 'tests', 'views') },
    resolver: EJBNodeJSResolver(),
  });
  const result = ejb.render("@import('@/imported')");
  expect(result).toContain("This is imported content.");
});

test("should handle css directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@head() @css body { color: red; } @end");
  expect(result).toContain("<style>");
  expect(result).toContain("body { color: red; }");
  expect(result).not.toContain("@head()");
});

test("should handle for directive", () => {
  const ejb = new Ejb();
  const result = ejb.render("@for(let i=0;i<3;i++) {{i}} @end");
  expect(result).toBe(" 0  1  2 ");
});

test("should handle component with default slot", () => {
    const ejb = new Ejb({
        async: false,
        aliases: { "@": join(pwd, 'tests', 'views') },
        resolver: EJBNodeJSResolver(),
    });
    const template = `
      @component('@/box')
        <p>Hello from a slot</p>
      @end
    `;
    const result = ejb.render(template);
    expect(result).toContain("<div><p>Hello from a slot</p></div>");
});

test("should handle component with named slots", () => {
    const ejb = new Ejb({
        async: false,
        aliases: { "@": join(pwd, 'tests', 'views') },
        resolver: EJBNodeJSResolver(),
    });
    const template = `
      @component('@/box')
        @slot('children')
          <p>Hello from a slot</p>
        @end
      @end
    `;
    const result = ejb.render(template);
    expect(result).toContain("<div><p>Hello from a slot</p></div>");
});