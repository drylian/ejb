import { build, type Options } from "tsup";
import { writeFile } from "fs/promises";
import { generateDtsBundle } from "dts-bundle-generator";
import { dirname, join } from "path";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { rm } from "fs/promises";

if (existsSync("dist")) await rm("dist", { recursive: true });

const sharedConfig: Options = {
	platform: "node",
	entry: ["src/index.ts"],
	bundle: true,
	minify: true,
	minifyIdentifiers: true,
	minifySyntax: true,
	minifyWhitespace: true,
	skipNodeModulesBundle: true,
	clean: true,
	dts: false,
};

await build({
	format: "cjs",
	outDir: "cjs",
	tsconfig: "./tsconfig.cjs.json",
	splitting: false,
	shims: true,
	...sharedConfig,
});

await build({
	format: ["esm"],
	outDir: "esm",
	tsconfig: "./tsconfig.mjs.json",
	splitting: true,
	cjsInterop: false,
	...sharedConfig,
});

await writeFile(
	"cjs/package.json",
	JSON.stringify({ type: "commonjs" }, null, 2),
);
await writeFile(
	"esm/package.json",
	JSON.stringify({ type: "module" }, null, 2),
);

const dtsPath = join(process.cwd(), "index.d.ts");
const dtsCode = generateDtsBundle([
	{
		filePath: join(process.cwd(), "src/index.ts"),
		output: {
			sortNodes: true,
			exportReferencedTypes: true,
			inlineDeclareExternals: true,
			inlineDeclareGlobals: true,
		},
	},
]);

await mkdir(dirname(dtsPath), { recursive: true });
await writeFile(dtsPath, dtsCode, { encoding: "utf-8" });
