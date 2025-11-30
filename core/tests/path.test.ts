import { expect, test } from "bun:test";
import { join } from "path";
import { Kire } from "../src/index";

test("Kire - Path Resolution and Aliases", async () => {
	const kire = new Kire({
		root: "/app/views",
		alias: {
			"@components": "/app/components",
			"~": "/app/views",
		},
	});

	// Test basic resolution relative to root
	expect(kire.resolvePath("header")).toBe("/app/views/header.kire");

	// Test alias resolution
	expect(kire.resolvePath("@components/Button")).toBe(
		"/app/components/Button.kire",
	);
	expect(kire.resolvePath("~/layout/Main")).toBe("/app/views/layout/Main.kire");

	// Test absolute path (should remain absolute)
	expect(kire.resolvePath("/absolute/path/file")).toBe(
		"/absolute/path/file.kire",
	);
});

test("Kire - Resolver in Directive", async () => {
	const kire = new Kire({
		root: "/", // Change root to '/' for consistent alias resolution
	});
	kire.directive({
		name: "path",
		params: ["p:string"],
		onCall(ctx) {
			const resolved = kire.resolvePath(ctx.param("p"));
			ctx.raw(`$ctx.res("${resolved}");`);
		},
	});

	const result = await kire.render("@path('~/home')");
	expect(result).toBe("/home.kire");
});

test("Kire - File Resolver Integration (Mock)", async () => {
	const kire = new Kire({
		root: "/views",
		resolver: async (filename) => {
			if (filename === "/views/partial.kire") {
				return "Partial Content";
			}
			throw new Error("File not found");
		},
	});

	// We can test render by passing a path instead of content
	// Since we don't have FS access here, we rely on our mock resolver

	// Note: render() expects template string OR path.
	// Our mock assumes /views/partial.kire is the resolved path.

	// render('partial') -> resolves to /views/partial.kire -> calls resolver -> returns content -> compiles content
	const result = await kire.render("partial");
	expect(result).toBe("Partial Content");
});
