import { describe, expect, it, beforeEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { EjbBuilder } from "../src/builder";
import { EJBNodeJSResolver } from "../src/resolvers";

const pwd = process.cwd();
const distPath = join(pwd, "tests", "dist");

describe("EjbBuilder", () => {
	let builder: EjbBuilder;

	beforeEach(async () => {
		if (existsSync(distPath)) {
			await rm(distPath, { recursive: true });
		}
		await mkdir(distPath, { recursive: true });

		builder = new EjbBuilder({
			aliases: { "@": join(pwd, "tests", "views") },
			resolver: EJBNodeJSResolver(),
			dist: distPath,
		});
	});

	it("should set and get current file", () => {
		builder.file("@/main.ejb");
		expect(builder.current).toBe("@/main.ejb");
	});

	it("should set and get current loader", () => {
		builder.load("client");
		expect(builder.loader).toBe("client");
	});

	it("should add content to different loaders", () => {
		builder.file("@/test.ejb");

		builder.res("const server = true;", "server");
		builder.res("const client = true;", "client");
		builder.res(".button { color: red; }", "css");

		const fileContents = builder.files["@/test.ejb"];
		expect(fileContents).toBeDefined();
		expect(fileContents.length).toBe(3);

		const serverContent = fileContents.find((f) => f.loader === "server");
		const clientContent = fileContents.find((f) => f.loader === "client");
		const cssContent = fileContents.find((f) => f.loader === "css");

		expect(serverContent?.content).toBe("const server = true;");
		expect(clientContent?.content).toBe("const client = true;");
		expect(cssContent?.content).toBe(".button { color: red; }");
	});

	it("should use current loader by default", () => {
		builder.file("@/test.ejb");
		builder.load("client");
		builder.res("console.log('client');");

		const fileContents = builder.files["@/test.ejb"];
		const clientContent = fileContents.find((f) => f.loader === "client");

		expect(clientContent?.content).toBe("console.log('client');");
	});

	it("should build files and generate manifest", async () => {
		builder.file("@/main.ejb");
		builder.res("const server = 'main';", "server");
		builder.res("const client = 'main';", "client");
		builder.res(".main { color: blue; }", "css");

		const manifest = await builder.build();

		expect(manifest.paths["@/main.ejb"]).toBeDefined();
		expect(manifest.paths["@/main.ejb"].entry).toMatch(/^se-main\.[a-f0-9]{8}\.js$/);
		expect(manifest.paths["@/main.ejb"].assets.length).toBe(2);

		const hasClientJs = manifest.paths["@/main.ejb"].assets.some((a) =>
			a.match(/^cl-main\.[a-f0-9]{8}\.js$/),
		);
		const hasCss = manifest.paths["@/main.ejb"].assets.some((a) =>
			a.match(/^st-main\.[a-f0-9]{8}\.css$/),
		);

		expect(hasClientJs).toBe(true);
		expect(hasCss).toBe(true);
	});

	it("should load manifest after build", async () => {
		builder.file("@/test.ejb");
		builder.res("const test = true;", "server");
		await builder.build();

		const manifest = await builder.loadManifest();
		expect(manifest.paths["@/test.ejb"]).toBeDefined();
	});

	it("should get entry file", async () => {
		builder.file("@/test.ejb");
		builder.res("const test = true;", "server");
		await builder.build();

		const entry = await builder.getEntry("@/test.ejb");
		expect(entry).toMatch(/^se-test\.[a-f0-9]{8}\.js$/);
	});

	it("should get assets for file", async () => {
		builder.file("@/test.ejb");
		builder.res("const server = true;", "server");
		builder.res("const client = true;", "client");
		builder.res(".test { }", "css");
		await builder.build();

		const assets = await builder.getAssets("@/test.ejb");
		expect(assets.length).toBe(2);
	});

	it("should throw error if no file is set when calling res", () => {
		expect(() => {
			builder.res("test");
		}).toThrow("[EJB] No file set. Call file() first.");
	});

	it("should handle multiple files", async () => {
		builder.file("@/file1.ejb").res("file1 server", "server");
		builder.file("@/file2.ejb").res("file2 server", "server");

		expect(builder.files["@/file1.ejb"]).toBeDefined();
		expect(builder.files["@/file2.ejb"]).toBeDefined();

		const manifest = await builder.build();
		expect(manifest.paths["@/file1.ejb"]).toBeDefined();
		expect(manifest.paths["@/file2.ejb"]).toBeDefined();
	});
});
