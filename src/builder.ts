import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ejb } from "./ejb";
import { ejbParser } from "./parser";
import type { EjbContructor } from "./types";
import { md5 } from "./utils";

export type LoaderType = "server" | "client" | "css";

export interface FileContent {
	loader: LoaderType;
	content: string;
}

export interface BuildManifest {
	paths: Record<
		string,
		{
			entry: string;
			assets: string[];
		}
	>;
}

/**
 * EJB Builder class for SSR support
 * Extends Ejb with build capabilities
 */
export class EjbBuilder extends Ejb {
	/** Storage for compiled files with multiple loaders */
	public files: Record<string, FileContent[]> = {};

	/** Current file being processed */
	private _currentFile: string = "";

	/** Current loader being used */
	private _currentLoader: LoaderType = "server";

	/** Distribution directory for build output */
	public dist: string;

	/** Build manifest cache */
	private manifest?: BuildManifest;

	constructor(opts: Partial<EjbContructor> & { dist?: string } = {}) {
		super(opts);
		this.dist = opts.dist ?? "./dist";
	}

	/**
	 * Sets the current file being processed
	 * @param filepath - Path to the file
	 */
	public file(filepath: string): this {
		this._currentFile = filepath;
		if (!this.files[filepath]) {
			this.files[filepath] = [];
		}
		return this;
	}

	/**
	 * Gets the current file being processed
	 */
	public get current(): string {
		return this._currentFile;
	}

	/**
	 * Sets the current loader
	 * @param loader - Loader type to use
	 */
	public load(loader: LoaderType): this {
		this._currentLoader = loader;
		return this;
	}

	/**
	 * Gets the current loader
	 */
	public get loader(): LoaderType {
		return this._currentLoader;
	}

	/**
	 * Adds content to the specified loader
	 * @param text - Content to add
	 * @param type - Loader type (defaults to current loader)
	 */
	public res(text: string, type: LoaderType = this._currentLoader): void {
		if (!this._currentFile) {
			throw new Error("[EJB] No file set. Call file() first.");
		}

		const fileContents = this.files[this._currentFile];
		let loaderContent = fileContents.find((f) => f.loader === type);

		if (!loaderContent) {
			loaderContent = { loader: type, content: "" };
			fileContents.push(loaderContent);
		}

		loaderContent.content += text;
	}

	/**
	 * Builds all files and generates the manifest
	 * @returns Build manifest
	 */
	public async build(): Promise<BuildManifest> {
		const manifest: BuildManifest = { paths: {} };

		for (const [filepath, contents] of Object.entries(this.files)) {
			const fileAssets: string[] = [];

			for (const { loader, content } of contents) {
				const hash = md5(content).substring(0, 8);
				const prefix = loader === "server" ? "se" : loader === "client" ? "cl" : "st";
				const ext = loader === "css" ? "css" : "js";
				const basename = filepath.split("/").pop()?.replace(/\.ejb$/, "") || "file";
				const filename = `${prefix}-${basename}.${hash}.${ext}`;

				await writeFile(join(this.dist, filename), content, "utf-8");

				if (loader === "server") {
					manifest.paths[filepath] = {
						entry: filename,
						assets: [],
					};
				} else {
					fileAssets.push(filename);
				}
			}

			if (manifest.paths[filepath]) {
				manifest.paths[filepath].assets = fileAssets;
			}
		}

		await writeFile(
			join(this.dist, "ejb.json"),
			JSON.stringify(manifest, null, 2),
			"utf-8",
		);

		this.manifest = manifest;
		return manifest;
	}

	/**
	 * Loads the build manifest from dist
	 */
	public async loadManifest(): Promise<BuildManifest> {
		if (this.manifest) return this.manifest;

		try {
			const content = await readFile(join(this.dist, "ejb.json"), "utf-8");
			const manifest: BuildManifest = JSON.parse(content);
			this.manifest = manifest;
			return manifest;
		} catch (e) {
			throw new Error(
				`[EJB] Failed to load manifest from ${this.dist}/ejb.json`,
			);
		}
	}

	/**
	 * Gets the entry file path for a template
	 * @param filepath - Template file path
	 */
	public async getEntry(filepath: string): Promise<string | undefined> {
		const manifest = await this.loadManifest();
		return manifest.paths[filepath]?.entry;
	}

	/**
	 * Gets the assets for a template
	 * @param filepath - Template file path
	 */
	public async getAssets(filepath: string): Promise<string[]> {
		const manifest = await this.loadManifest();
		return manifest.paths[filepath]?.assets || [];
	}

	/**
	 * Renders a template using the built files
	 * @param filepath - Template file path
	 * @param locals - Local variables
	 */
	public async renderBuilt(
		filepath: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		const entry = await this.getEntry(filepath);
		if (!entry) {
			throw new Error(`[EJB] No entry found for ${filepath}`);
		}

		const entryPath = join(this.dist, entry);
		const entryContent = await readFile(entryPath, "utf-8");

		const execute = new AsyncFunction("$ejb", this.globalvar, entryContent);
		const result = await execute(
			{
				ins: this,
				res: "",
				escapeHtml: (str: string) => str.replace(/[&<>"']/g, (m) => ({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				}[m] || m)),
				escapeJs: (str: string) => str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${"),
				EjbFunction: AsyncFunction,
			},
			{ ...this.globals, ...locals },
		);

		return result.res;
	}

	/**
	 * Compiles a file with all loaders
	 * @param filepath - Path to the template file
	 */
	public async compileFile(filepath: string): Promise<void> {
		this.file(filepath);

		const content = await this.resolver(filepath);
		const ast = ejbParser(this, content);

		if (ast.errors.length) {
			this.errors.push(...ast.errors);
			return;
		}

		// Compile for each loader
		for (const loaderType of ["server", "client", "css"] as LoaderType[]) {
			this.load(loaderType);
			const code = await this.compile(ast);
			this.res(code, loaderType);
		}
	}
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
