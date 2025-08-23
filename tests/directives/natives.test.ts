import { describe, it, expect, test } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../../src/ejb";
import { EJBNodeJSResolver } from "../../src/resolvers";

const pwd = process.cwd();

const createEjbInstance = () =>
	new Ejb({
		async: false,
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

describe("EJB / Directives / natives", () => {
    test("should handle 'if' directive", () => {
        const ejb = createEjbInstance();
        const template = `@if(true)Hello@end`;
        const result = ejb.render(template);
        expect(result).toBe("Hello");
    });

    it("should handle @if, @elseif, @else directives", () => {
        const ejb = createEjbInstance();
        const template = `
            @if(it.value === 1)
                one
            @elseif(it.value === 2)
                two
            @else
                other
            @end
        `;

        expect(ejb.render(template, { value: 1 }).trim()).toBe("one");
        expect(ejb.render(template, { value: 2 }).trim()).toBe("two");
        expect(ejb.render(template, { value: 3 }).trim()).toBe("other");
    });

    test("should handle 'for' directive", () => {
        const ejb = createEjbInstance();
        const template = `@for(let i = 0; i < 3; i++){{i}}@end`;
        const result = ejb.render(template);
        expect(result).toBe("012");
    });

    test("should handle 'isset' directive", () => {
        const ejb = createEjbInstance();
        const template = `@isset(it.name)`;
        const result = ejb.render(template, { name: "John" });
        expect(result).toBe("John");
    });

    it("should handle @switch, @case, @default directives", () => {
        const ejb = createEjbInstance();
        const template = `
            @switch(it.value)
                @case(1)
                    one
                @case(2)
                    two
                @default
                    other
            @end
        `;
        const r1 = ejb.render(template, { value: 1 });
        const r2 = ejb.render(template, { value: 2 });
        const r3 = ejb.render(template, { value: 3 });

        expect(r1.trim()).toBe("one");
        expect(r2.trim()).toBe("two");
        expect(r3.trim()).toBe("other");
    });

    it('should handle @once directive', () => {
        const ejb = createEjbInstance();
        const template = `@once{{ "hello" }}@end@once{{ "hello" }}@end`;
        const result = ejb.render(template);
        expect(result).toBe('hello');
    });

    it('should handle @code directive', () => {
        const ejb = createEjbInstance();
        const template = `@code const hello = "hello";@end{{ hello }}`;
        const result = ejb.render(template);
        expect(result).toInclude('hello');
    });

    it('should handle @once directive correctly', () => {
        const ejb = createEjbInstance();
        const template = `@once<div>once</div>@end@once<div>once</div>@end`;
        const result = ejb.render(template);
        expect(result).toBe('<div>once</div>');
    });

    it('should handle @code directive correctly', () => {
        const ejb = createEjbInstance();
        const template = `@code const name = "EJB";@end<p>Hello, {{ name }}</p>`;
        const result = ejb.render(template);
        expect(result).toBe('<p>Hello, EJB</p>');
    });
});