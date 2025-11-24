import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import {
	escapeHtml,
	escapeJs,
	filepathResolver,
	join,
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

test("should join paths", () => {
	expect(join("a", "b", "c")).toBe("a/b/c");
});