import { test, expect } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../../src/ejb";
import { EJBNodeJSResolver } from "../../src/resolvers";

const pwd = process.cwd();

const createEjbInstance = () =>
	new Ejb({
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

test("should handle 'import' directive", async () => {
	const ejb = createEjbInstance();
	const template = `@import('@/imported')`;
	const result = await ejb.render(template);
	expect(result).toContain("This is imported content.");
});