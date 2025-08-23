import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import {
	escapeHtml,
	escapeJs,
	filepathResolver,
	isPromise,
	join,
	PromiseResolver,
	returnEjbRes,
} from "../src/utils";

test("should escape JS strings", () => {
	// biome-ignore lint/suspicious/noTemplateCurlyInString: regex check
	expect(escapeJs("Hello `world` ${name}")).toBe("Hello \\`world\\` \\${name}");
});

test("should escape HTML", () => {
	expect(escapeHtml("<script>alert('xss')</script>")).toBe(
		"&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
	);
});

test("should detect promises", () => {
	expect(isPromise(Promise.resolve())).toBe(true);
	// biome-ignore lint/suspicious/noThenProperty: simulation
	expect(isPromise({ then: () => {} })).toBe(true);
	expect(isPromise("not a promise")).toBe(false);
});

test("should resolve file paths with aliases", () => {
	const ejb = new Ejb({
		aliases: { "@/": "/src/" },
		root: "/project",
	});
	expect(filepathResolver(ejb, "@/components/header.ejb")).toBe(
		"/src/components/header.ejb",
	);
	expect(filepathResolver(ejb, "utils/helper", "/project/main.ejb")).toBe(
		"/project/utils/helper.ejb",
	);
});

test("should return ejb response", () => {
	const ejb = new Ejb();
	expect(returnEjbRes(ejb, "test")).toBe(
		"((($ejb) => {test; return $ejb.res})({...$ejb, res:''}))",
	);
});

test("should resolve promises", async () => {
	const result = await PromiseResolver(Promise.resolve(1), (v) => v + 1);
	expect(result).toBe(2);
});

test("should join paths", () => {
	expect(join("a", "b", "c")).toBe("a/b/c");
});