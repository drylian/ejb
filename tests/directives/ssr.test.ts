import { describe, expect, it, beforeEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { EjbBuilder } from "../../src/builder";
import { EJBNodeJSResolver } from "../../src/resolvers";

const pwd = process.cwd();
const distPath = join(pwd, "tests", "dist-ssr");

describe("SSR Directives", () => {
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

	it("should handle @client directive", async () => {
		builder.file("@/test.ejb");

		const template = `
			@client
				const handleClick = () => console.log('clicked');
			@end
		`;

		const ast = builder.parser(template);
		builder.load("server");
		await builder.compile(ast);
		builder.load("client");
		await builder.compile(ast);

		const serverContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "server",
		);
		const clientContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "client",
		);

		expect(clientContent?.content).toContain("handleClick");
		expect(serverContent?.content).not.toContain("handleClick");
	});

	it("should handle @server directive", async () => {
		builder.file("@/test.ejb");

		const template = `
			@server
				const data = await fetchFromDB();
			@end
		`;

		const ast = builder.parser(template);
		builder.load("server");
		await builder.compile(ast);
		builder.load("client");
		await builder.compile(ast);

		const serverContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "server",
		);
		const clientContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "client",
		);

		expect(serverContent?.content).toContain("fetchFromDB");
		expect(clientContent?.content).not.toContain("fetchFromDB");
	});

	it("should handle @style directive", async () => {
		builder.file("@/test.ejb");

		const template = `
			@style
				.button { background: blue; }
			@end
		`;

		const ast = builder.parser(template);
		builder.load("css");
		await builder.compile(ast);

		const cssContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "css",
		);

		expect(cssContent?.content).toContain(".button");
	});

	it("should handle @let with EjbBuilder", async () => {
		builder.file("@/test.ejb");

		const template = "@let myVar = 'test'";

		const ast = builder.parser(template);
		builder.load("server");
		await builder.compile(ast);

		const serverContent = builder.files["@/test.ejb"].find(
			(f) => f.loader === "server",
		);

		expect(serverContent?.content).toContain("let myVar = 'test'");
	});

	it("should separate server and client code", async () => {
		builder.file("@/app.ejb");

		const template = `
			<div>
				@server
					const apiData = await fetch('/api/data');
				@end

				<h1>{{ it.title }}</h1>

				@client
					const button = document.querySelector('button');
					button.onclick = () => alert('clicked');
				@end
			</div>
		`;

		const ast = builder.parser(template);

		builder.load("server");
		await builder.compile(ast);

		builder.load("client");
		await builder.compile(ast);

		const serverContent = builder.files["@/app.ejb"].find(
			(f) => f.loader === "server",
		);
		const clientContent = builder.files["@/app.ejb"].find(
			(f) => f.loader === "client",
		);

		expect(serverContent?.content).toContain("apiData");
		expect(serverContent?.content).toContain("<h1>");
		expect(serverContent?.content).not.toContain("document.querySelector");

		expect(clientContent?.content).toContain("document.querySelector");
		expect(clientContent?.content).not.toContain("apiData");
	});

	it("should build SSR application", async () => {
		builder.file("@/main.ejb");

		builder.load("server");
		builder.res(`
			const data = { title: 'SSR App' };
			$ejb.res += '<div>' + data.title + '</div>';
		`);

		builder.load("client");
		builder.res(`
			console.log('Hydrating...');
			document.body.classList.add('hydrated');
		`);

		builder.load("css");
		builder.res(`
			body { font-family: Arial; }
			.hydrated { opacity: 1; }
		`);

		const manifest = await builder.build();

		expect(manifest.paths["@/main.ejb"]).toBeDefined();
		expect(manifest.paths["@/main.ejb"].entry).toMatch(/^se-main\./);
		expect(manifest.paths["@/main.ejb"].assets.length).toBe(2);
	});
});
