import { expect, test } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";

const pwd = process.cwd();

const createEjbInstance = () =>
	new Ejb({
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

test("should return error for non-existent directive", async () => {
	const ejb = createEjbInstance();
	const template = `@nonexistent()`;
	const result = await ejb.render(template);
	expect(result).toContain("[EJB] Directive not found: nonexistent");
});

test("should return error for non-existent sub-directive", async () => {
	const ejb = createEjbInstance();
	const template = `@if(true) @nonexistentsub() @end`;
	const result = await ejb.render(template);
	expect(result).toContain('[EJB] Directive not found: nonexistentsub');
});

test("should return error from directive lifecycle hook", async () => {
	const ejb = createEjbInstance();
	ejb.register({
		name: "errorprone",
		onParams: () => {
			throw new Error("Error in onParams");
		},
	});
	const template = `@errorprone()`;
	const result = await ejb.render(template);
	expect(result).toContain("Error in onParams");
});

test("should return error for non-existent import", async () => {
	const ejb = createEjbInstance();
	const template = `@import('./nonexistent.ejb')`;
	const result = await ejb.render(template); // Await the promise
	expect(result).toContain("no such file or directory"); // Expect string content
});

test("should collect and return multiple errors", async () => {
	const ejb = createEjbInstance();
	const template = `@nonexistent() @anotheError()`;
	const result = await ejb.render(template);
	expect(result).toContain("[EJB] Directive not found: nonexistent");
	expect(result).toContain("[EJB] Directive not found: anotheError");
});

test("should return error from async directive lifecycle hook", async () => {
	const ejb = createEjbInstance();
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
