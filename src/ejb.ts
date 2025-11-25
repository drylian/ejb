import { compile, generateNodeCode, generateNodeString } from "./compiler";
import { compileForBuild } from "./build-compiler";
import { EjbBuilder, type FileArtefact } from "./builder";
import {
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_GLOBAL,
	EJB_DEFAULT_PREFIX_VARIABLE,
	ejbDirective,
	HTML_REGULAR_REGEX,
} from "./constants";
import { DEFAULT_DIRECTIVES } from "./directives";
import { ejbParser } from "./parser";
import type {
	AstNode,
	EjbContructor,
	EjbDirectivePlugin,
	EjbError,
	RootNode,
} from "./types";
import {
	AsyncFunction,
	escapeHtml,
	escapeJs,
	escapeRegExp,
	escapeString,
	filepathResolver,
	md5,
} from "./utils";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { promises as fs } from "fs";

/**
 * EJB Template Engine class
 */
export class Ejb {
	/** File resolver function */
	public resolver: EjbContructor["resolver"];
	/** File writer function (for build process) */
	public writer: EjbContructor["writer"];
	/** Default file extension */
	public extension: EjbContructor["extension"];
	/** Global variables available in templates */
	public globals: EjbContructor["globals"];
	/** Prefix configuration */
	public globalvar: EjbContructor["globalvar"];
	/** Path aliases mapping */
	public aliases: EjbContructor["aliases"];
	/** Root directory for file resolution */
	public root: EjbContructor["root"];
	/** Manifest file loaded from build output */
	public manifest: Record<string, any> = {};

	/** expose global keys in file, example: it.exemple -> it.exemple | exemple */
	public globalexpose: boolean;
	/** Development mode flag */
	public depuration: boolean;

	/** Stores errors during compilation */
	public errors: EjbError[] = [];

	/** Cache for build artefacts (server, client, css) */
	public files: Record<string, FileArtefact[]> = {};
	/** Cache for imported component functions or production-mode import paths */
	public resolvers: Record<string, string> = {};

	/**
	 * Returns the appropriate function constructor (AsyncFunction or Function)
	 * based on async mode
	 * @returns {FunctionConstructor} The function constructor to use
	 */
	public getFunction = () => AsyncFunction;

	/** Registered directives */
	public directives: EjbContructor["directives"] = {};

	/**
	 * [BUILD PROCESS] Builds an entry point and its dependencies into a dist folder.
	 * @param entryPoint The path to the entry .ejb file.
	 * @param dist The output directory.
	 */
	public async build(entryPoint: string, dist: string) {
		this.errors = [];
		this.files = {};
		this.resolvers = {};

		const resolvedPath = filepathResolver(this, entryPoint);
		const content = await this.resolver(resolvedPath);

		const builder = new EjbBuilder(this);
		builder.file(resolvedPath);

		const ast = this.parser(content);
		if (ast.errors.length) {
			this.errors.push(...ast.errors);
		}

		if (this.errors.length) {
			console.error("[EJB] Build failed with parsing errors.");
			this.errors.forEach(e => console.error(e.stack || e.message));
			return;
		}

		await compileForBuild(builder, ast);

		if (this.errors.length) {
			console.error("[EJB] Build failed with compilation errors.");
			this.errors.forEach(e => console.error(e.stack || e.message));
			return;
		}

		// --- File Generation ---
		const manifest: Record<string, { entry: string, assets: string[] }> = {};
		const writePromises: Promise<void>[] = [];

		const loaderPrefixMap: Record<string, string> = {
			server: 'se',
			client: 'cl',
		};

		for (const [filepath, artefacts] of Object.entries(this.files)) {
			const fileKey = '@/' + path.relative(this.root, filepath);
			manifest[fileKey] = { entry: '', assets: [] };

			for (const artefact of artefacts) {
				const hash = md5(artefact.content).slice(0, 8);
				const baseName = path.basename(filepath, `.${this.extension}`);

				let newFileName: string;
				if (artefact.loader === 'css') {
					newFileName = `${baseName}.${hash}.css`;
				} else {
					const prefix = loaderPrefixMap[artefact.loader] || artefact.loader;
					newFileName = `${prefix}-${baseName}.${hash}.js`;
				}

				const fullPath = path.join(dist, newFileName);
				writePromises.push(this.writer(fullPath, artefact.content));

				if (artefact.loader === 'server') {
					manifest[fileKey].entry = newFileName;
				} else {
					manifest[fileKey].assets.push(newFileName);
				}
			}
		}

		// Write manifest.json
		const manifestPath = path.join(dist, 'ejb.json');
		writePromises.push(this.writer(manifestPath, JSON.stringify(manifest, null, 2)));

		await Promise.all(writePromises);

		console.log("[EJB] Build completed.");
	}

	/**
	 * Compiles a template into a function string that can be executed later
	 * @param template - Template string or path to template file
	 * @returns The generated function code as string (wrapped in Promise if async)
	 */
	public async makeFunction(template: string): Promise<Function> {
		this.errors = [];
		const isPotentialPath = this.isTemplatePath(template);

		const processTemplate = async (content: string): Promise<Function> => {
			const ast = ejbParser(this, content);
			if (ast.errors.length) {
				this.errors.push(...ast.errors);
			}
			const compiledCode = await compile(this, ast);
			console.log(compiledCode)
			if (this.errors.length > 0) {
				const errorContent = JSON.stringify(
					this.errors.map((e) => ({
						message: e.stack || e.message,
						loc: e.loc,
					})),
				);
				// If compilation errors, return a function that throws
				return () => {
					const err = new Error('EJB compilation failed');
					err.details = errorContent;
					throw err;
				};
			}

			const ejbInstance = this;
			const AsyncFunctionConstructor = this.getFunction();
			return new AsyncFunctionConstructor("$ejb", this.globalvar, `${compiledCode}\nreturn $ejb.res;`).bind(ejbInstance);
		};

		if (isPotentialPath) {
			try {
				const resolvedPath = filepathResolver(this, template);
				const resolvedContent = await Promise.resolve(
					this.resolver(resolvedPath),
				);
				return processTemplate(resolvedContent);
			} catch (e) {
				if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
					console.warn(
						`[EJB] Template path resolution failed, using as literal: ${template}`,
					);
					return processTemplate(template);
				}
				throw e;
			}
		}

		return processTemplate(template);
	}

	/**
	 * Compiles AST node(s) to executable code or string
	 * @param node - AST node or array of nodes to compile
	 * @param stringMode - Whether to generate string output instead of executable code
	 * @returns Compiled code or string (wrapped in Promise if async)
	 */
	public async compile(
		node: AstNode | AstNode[],
		stringMode = false,
	): Promise<string> {
		const nodes = Array.isArray(node) ? node : [node];
		const generator = stringMode ? generateNodeString : generateNodeCode;

		const codes = await Promise.all(
			nodes.map((_node) => generator(this, _node)),
		);

		return codes.join("");
	}

	/**
	 * Parses template string into AST
	 * @param code - Template string to parse
	 * @returns Root AST node
	 */
	public parser(code: string): RootNode {
		return ejbParser(this, code);
	}

	/**
	 * Renders a template with provided locals
	 * @param template - Template string or path to template file
	 * @param locals - Variables to make available during rendering
	 * @returns Rendered output (wrapped in Promise if async)
	 */
	public async render(
		template: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		this.errors = [];
		let resolvedPath: string | undefined;
		const isPotentialPath = this.isTemplatePath(template);

		if (isPotentialPath) {
			try {
				resolvedPath = filepathResolver(this, template);
				template = await Promise.resolve(this.resolver(resolvedPath));
			} catch (e) {
				if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
					console.warn(
						`[EJB] Template path resolution failed, using as literal: ${template}`,
					);
				} else {
					throw e;
				}
			}
		}

		// In depuration mode, run the build-compiler to populate in-memory assets
		if (this.depuration) {
			this.files = {};
			const builder = new EjbBuilder(this);
			// Use a generic key for string-based templates, or the resolved path
			builder.file(resolvedPath || '__EJB_DEBBUG__');
			const astForBuild = this.parser(template);
			await compileForBuild(builder, astForBuild);
		}

		// Get the compiled render function
		const renderFunction = await this.makeFunction(template);

		if (this.errors.length > 0) {
			const errorMessages = this.errors
				.map((e) => e.stack || e.message)
				.join("\n\n");
			this.errors = [];
			return errorMessages;
		}

		// Prepare the execution context
		const ejbContext = {
			ins: this,
			res: "", // Always start with an empty result string
			escapeHtml,
			escapeJs,
			escapeString,
			EjbFunction: this.getFunction(),
		};
		const globalLocals = { ...this.globals, ...locals };

		// Execute the render function
		const result = await renderFunction(ejbContext, globalLocals);

		return result;
	}

	/**
	 * Determines if a string is likely a template path
	 * @param template - String to check
	 * @returns True if string appears to be a path
	 */
	private isTemplatePath(template: string): boolean {
		const trimmed = template.trim();

		// 1. It's NOT a path if it contains newlines.
		if (trimmed.includes("\n")) {
			return false;
		}

		// 2. It's NOT a path if it contains template syntax like interpolation or directives.
		const [interpStart] = EJB_DEFAULT_PREFIX_VARIABLE.split("*");
		if (trimmed.includes(interpStart)) {
			return false;
		}
		const directivePattern = new RegExp(
			`^s*${escapeRegExp(EJB_DEFAULT_PREFIX_DIRECTIVE)}`,
		);
		if (directivePattern.test(trimmed)) {
			return false;
		}

		// 3. It's NOT a path if it looks like HTML.
		if (HTML_REGULAR_REGEX.test(trimmed)) {
			return false;
		}

		// 4. It IS a path if it contains path characters and wasn't identified as a template.
		return (
			trimmed.includes("/") ||
			trimmed.includes("\\") ||
			trimmed.startsWith("@/") ||
			trimmed.startsWith("@\\")
		);
	}

	/**
	 * Registers one or more directives
	 * @param directives - Directives to register
	 * @returns The Ejb instance for chaining
	 */
	public register(
		...directives: (EjbDirectivePlugin | Record<string, EjbDirectivePlugin>)[]
	) {
		const formatted = directives.map((i) =>
			Object.keys(i).length === 1 ? i : ejbDirective(i as EjbDirectivePlugin),
		);
		this.directives = Object.assign(this.directives, ...formatted);
		return this;
	}

	/**
	 * Creates an Ejb instance
	 * @param opts - Configuration options
	 */
	constructor(opts: Partial<EjbContructor> = {}) {
		this.aliases = opts.aliases ?? {};
		this.extension = opts.extension ?? "ejb";
		this.globals = opts.globals ?? {};
		this.root = opts.root ?? "./";
		this.globalexpose = opts.globalexpose ?? true;
		this.resolver =
			opts.resolver ??
			((path: string) => {
				const content = `[EJB]: Resolver not defined, but was required for path: ${path}`;
				return Promise.reject(new Error(content));
			});

		this.writer =
			opts.writer ??
			(async (filepath: string, content: string) => {
				const dir = path.dirname(filepath);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
				await fs.writeFile(filepath, content);
			});

		this.directives = Object.assign({}, DEFAULT_DIRECTIVES, opts.directives);

		this.globalvar = opts?.globalvar ?? EJB_DEFAULT_PREFIX_GLOBAL;
		this.globalexpose = opts.globalexpose ?? true;
		this.depuration = opts.depuration ?? false;
		this.manifest = opts.manifest ?? {}; // Initialize manifest directly from options

		if (opts.manifestPath) {
			this.resolver(opts.manifestPath)
				.then(content => {
					try {
						this.manifest = JSON.parse(content);
					} catch (e) {
						console.error(`[EJB] Failed to parse manifest file: ${opts.manifestPath}`, e);
					}
				})
				.catch(err => {
					console.error(`[EJB] Failed to load manifest file: ${opts.manifestPath}`, err);
				});
		}
	}
}
