import { expect, test } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";

const pwd = process.cwd();

const createEjbInstance = (async = false) =>
	new Ejb({
		async,
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(async),
	});

test("should return error for non-existent directive", () => {
	const ejb = createEjbInstance();
	const template = `@nonexistent()`;
	const result = ejb.render(template);
	expect(result).toContain("[EJB] Directive not found: nonexistent");
});

test("should return error for non-existent sub-directive", () => {
	const ejb = createEjbInstance();
	const template = `@if(true) @nonexistentsub() @end`;
	const result = ejb.render(template);
	console.log(result)
	expect(result).toContain('[EJB] Directive not found: nonexistentsub');
});

test("should return error from directive lifecycle hook", () => {
	const ejb = createEjbInstance();
	ejb.register({
		name: "errorprone",
		onParams: () => {
			throw new Error("Error in onParams");
		},
	});
	const template = `@errorprone()`;
	const result = ejb.render(template);
	expect(result).toContain("Error in onParams");
});

test("should return error for async directive in sync mode", () => {
	const ejb = createEjbInstance();
	ejb.register({
		name: "asyncprone",
		onParams: async () => {
			return "";
		},
	});
	const template = `@asyncprone()`;
	const result = ejb.render(template);
	expect(result).toContain("[EJB] Async operation in sync mode for @asyncprone");
});

test("should return error for non-existent import", () => {
	const ejb = createEjbInstance();
	const template = `@import('./nonexistent.ejb')`;
	const result = ejb.render(template);
	expect(result).toContain("no such file or directory");
});

test("should collect and return multiple errors", () => {
	const ejb = createEjbInstance();
	const template = `@nonexistent() @import('./nonexistent.ejb')`;
	const result = ejb.render(template);
	expect(result).toContain("[EJB] Directive not found: nonexistent");
	expect(result).toContain("no such file or directory");
});

test("should return error from async directive lifecycle hook", async () => {
	const ejb = createEjbInstance(true);
	ejb.register({
		name: "errorprone",
		onParams: () => {
			return Promise.reject(new Error("Async error in onParams"));
		},
	});
	const template = `@errorprone()`;
	const result = await ejb.render(template);
	expect(result).toContain("Async error in onParams");
});
