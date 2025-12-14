import { Compiler } from "./compiler";
import { KireDirectives } from "./directives";
import { Parser } from "./parser";
import type {
	DirectiveDefinition,
	ElementDefinition,
	ICompilerConstructor,
	IParserConstructor,
	KireCache,
	KireElementHandler,
	KireElementOptions,
	KireOptions,
	KirePlugin,
	KireSchematic,
} from "./types";
import { md5 } from "./utils/md5";
import { resolvePath } from "./utils/resolve";

export class Kire {
	public $directives: Map<string, DirectiveDefinition> = new Map();
	public $elements: Set<ElementDefinition> = new Set();
	public $globals: Map<string, any> = new Map();

	public root: string;
	public production: boolean;
	public $resolver: (filename: string) => Promise<string>;
	public $readdir?: (pattern: string) => Promise<string[]>;
	public alias: Record<string, string>;
	public extension: string;
	public $files: Map<string, Function> = new Map();
	public $parser: IParserConstructor;
	public $compiler: ICompilerConstructor;
	public $var_locals: string;
	public $expose_locals: boolean;
	public $cache: Map<string, Map<string, any>> = new Map();

	public cacheClear() {
		this.$cache.clear();
		this.$files.clear();
	}

	public cached<T = any>(namespace: string): KireCache<T> {
		if (!this.$cache.has(namespace)) {
			this.$cache.set(namespace, new Map());
		}
		const store = this.$cache.get(namespace)!;
		return {
			get: (key: string) => store.get(key),
			set: (key: string, value: T) => store.set(key, value),
			has: (key: string) => store.has(key),
			delete: (key: string) => store.delete(key),
			clear: () => store.clear(),
			entries: () => store.entries(),
		};
	}

	constructor(options: KireOptions = {}) {
		this.root = options.root ?? "./";
		this.production = options.production ?? true;
		this.alias = options.alias ?? { "~/": this.root };
		this.extension = options.extension ?? "kire";
		this.$var_locals = options.varLocals ?? "it";
		this.$expose_locals = options.exposeLocals ?? true;

		this.$resolver =
			options.resolver ??
			(async (filename) => {
				throw new Error(`No resolver defined for path: ${filename}`);
			});

		this.$parser = options.engine?.parser ?? Parser;
		this.$compiler = options.engine?.compiler ?? Compiler;

		// Register internal helpers
		this.$ctx("$md5", md5);
		this.$ctx("~$pre", []);
		this.$ctx("~$pos", []);
		this.$ctx(
			"$require",
			async (path: string, locals: Record<string, any> = {}) => { // locals agora é um argumento de $require
				// Use absolute path for caching key to avoid conflicts
				const resolvedPath = resolvePath(
					path,
					this.root,
					this.alias,
					this.extension,
				);

				const cached = this.cached("@kirejs/core");
				const isProd = this.production;
				const hash = cached.get(`md5:${resolvedPath}`);
				let content = "";

				let compiledFn: Function | undefined;

				if (!hash || !isProd) {
					try {
						content = await this.$resolver(resolvedPath);
					} catch (e: any) {
						if (!e.message.includes("No resolver")) {
							console.warn(`Failed to resolve path: ${resolvedPath}`, e);
						}
						return null; // Retorna null se não encontrar, para a diretiva lidar
					}

					if (!content) {
						return null;
					}

					compiledFn = await this.compileFn(content, resolvedPath);
					const ihash = md5(content);
					
					cached.set(`md5:${resolvedPath}`, ihash);
					cached.set(`js:${resolvedPath}`, compiledFn); // Cache a função compilada
				} else {
					compiledFn = cached.get(`js:${resolvedPath}`);
				}

				if (!compiledFn) return null; // Retorna null se a função não foi compilada/cacheada

				// Executa a função compilada com os locals e retorna o HTML
				return this.run(compiledFn, locals);
			}
		);

		// Collect plugins to load
		const pluginsToLoad: Array<{ p: KirePlugin<any>; o?: any }> = [];

		// Register default directives
		if (
			typeof options.directives === "undefined" ||
			options.directives === true
		) {
			pluginsToLoad.push({ p: KireDirectives });
		}

		// User provided plugins
		if (options.plugins) {
			for (const p of options.plugins) {
				if (Array.isArray(p)) {
					pluginsToLoad.push({ p: p[0], o: p[1] });
				} else {
					pluginsToLoad.push({ p });
				}
			}
		}

		pluginsToLoad.sort((a, b) => (a.p.sort ?? 100) - (b.p.sort ?? 100));

		for (const item of pluginsToLoad) {
			this.plugin(item.p, item.o);
		}
	}

	public plugin<KirePlugged extends KirePlugin<any>>(
		plugin: KirePlugged,
		opts?: KirePlugged["options"],
	) {
		if (typeof plugin === "function") {
			(plugin as any)(this, opts);
		} else if (plugin.load) {
			plugin.load(this, opts);
		}
		return this;
	}

	public pkgSchema(
		name: string,
		repository?: string | { type: string; url: string },
		version?: string,
	): KireSchematic {
		const globals: Record<string, any> = {};
		this.$globals.forEach((value, key) => {
			globals[key] = value;
		});

		return {
			package: name,
			repository,
			version,
			directives: Array.from(this.$directives.values()),
			elements: Array.from(this.$elements.values()),
			globals: globals,
		};
	}

	public element(
		nameOrDef: string | RegExp | ElementDefinition,
		handler?: KireElementHandler,
		options?: KireElementOptions,
	) {
		if (
			typeof nameOrDef === "object" &&
			"onCall" in nameOrDef &&
			!("source" in nameOrDef)
		) {
			this.$elements.add(nameOrDef as ElementDefinition);
		} else {
			if (!handler) throw new Error("Handler is required for legacy element()")
			this.$elements.add({
				name: nameOrDef as string | RegExp,
				void: options?.void ?? false, // Default to false if not provided
				onCall: handler,
			});
		}
		return this;
	}

	public directive(def: DirectiveDefinition) {
		this.$directives.set(def.name, def);
		if (def.parents) {
			for (const parent of def.parents) {
				this.directive(parent);
			}
		}
		return this;
	}

	public getDirective(name: string) {
		return this.$directives.get(name);
	}

	public $ctx(key: string, value: any) {
		this.$globals.set(key, value);
		return this;
	}

	public parse(template: string) {
		const parser = new this.$parser(template, this);
		return parser.parse();
	}

	public async compile(template: string): Promise<string> {
		const parser = new this.$parser(template, this);
		const nodes = parser.parse();
		const compiler = new this.$compiler(this);
		return compiler.compile(nodes);
	}

	public async compileFn(content: string, filename?: string): Promise<Function> {
		const code = await this.compile(content);
		try {
			const AsyncFunction = Object.getPrototypeOf(async () => { }).constructor;

			const mainFn = new AsyncFunction("$ctx", code);
			(mainFn as any)._code = code;

			// Return the separated functions
			return mainFn;
		} catch (e) {
			console.error("Error creating function from code:", code);
			throw e;
		}
	}

	public async render(
		template: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		const fn = await this.compileFn(template, "template");
		return this.run(fn, locals);
	}

	public async view(
		path: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		const resolvedPath = resolvePath(path, this.root, this.alias, this.extension);
		let compiled: Function | undefined;

		if (this.production && this.$files.has(resolvedPath)) {
			compiled = this.$files.get(resolvedPath) as any;
		} else {
			try {
				const content = await this.$resolver(resolvedPath);
				compiled = await this.compileFn(content, resolvedPath);
				if (this.production) {
					this.$files.set(resolvedPath, compiled as any);
				}
			} catch (e) {
				throw e;
			}
		}

		if (!compiled) throw new Error(`Could not load view: ${path}`);
		return this.run(compiled, locals);
	}

	public resolvePath(
		filepath: string,
		currentFile?: string,
	): string {
		return resolvePath(filepath, this.root, this.alias, this.extension, currentFile);
	}

	private async run(mainFn: Function, locals: Record<string, any>): Promise<string> {
		const rctx: any = {};
		for (const [k, v] of this.$globals) {
			rctx[k] = v;
		}
		Object.assign(rctx, locals);

		if (this.$expose_locals) {
			rctx[this.$var_locals] = locals;
		}

		rctx['~res'] = "";
		rctx['~$pre'] = [];
		rctx['~$pos'] = [];

		rctx.res = function (this: any, str: any) {
			rctx['~res'] += str;
		};

		rctx.$res = () => rctx['~res'];

		rctx.$resolve = (path: string) => {
			return this.resolvePath(path);
		};

		rctx.$merge = async function (this: any, func: Function) {
			const parentRes = this['~res'];
			this['~res'] = "";
			await func(this);
			this['~res'] = parentRes + this['~res'];
		};

		let finalCtx;
		try {
			finalCtx = await mainFn(rctx);
		} catch (e: any) {
			if ((mainFn as any)._code) {
				e.kireGeneratedCode = (mainFn as any)._code;
			}
			throw e;
		}

		// Execute ~$pre functions collected during execution
		if (finalCtx['~$pre'] && finalCtx['~$pre'].length > 0) {
			for (const preFn of finalCtx['~$pre']) {
				await preFn(rctx);
			}
		}

		let resultHtml = finalCtx['~res'];
		
		// Execute ~$pos functions (deferred logic)
		if (finalCtx['~$pos'] && finalCtx['~$pos'].length > 0) {
			for (const posFn of finalCtx['~$pos']) {
				await posFn(rctx);
			}
			resultHtml = finalCtx['~res'];
		}

		if (this.$elements.size > 0) {
			for (const def of this.$elements) {
				const tagName =
					def.name instanceof RegExp ? def.name.source : def.name;

				const isVoid =
					def.void ||
					(typeof def.name === "string" &&
						/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(
							def.name,
						));

				const regex = isVoid
					? new RegExp(`<(${tagName})([^>]*)>`, "gi")
					: new RegExp(
						`<(${tagName})([^>]*)>([\\s\\S]*?)<\/\\1>`,
						"gi",
					);

				const matches = [];
				let match;
				while ((match = regex.exec(resultHtml)) !== null) {
					matches.push({
						full: match[0],
						tagName: match[1],
						attrs: match[2],
						inner: isVoid ? "" : match[3],
						index: match.index,
					});
				}

				for (const m of matches) {
					if (!resultHtml.includes(m.full)) {
						continue;
					}

					const attributes: Record<string, string> = {};
					const attrRegex = /(\w+)="([^"]*)"/g;
					let attrMatch;
					while ((attrMatch = attrRegex.exec(m.attrs!)) !== null) {
						attributes[attrMatch[1]!] = attrMatch[2]!;
					}

					const elCtx: any = Object.create(rctx);
					elCtx.content = resultHtml;
					elCtx.element = {
						tagName: m.tagName,
						attributes,
						inner: m.inner,
						outer: m.full,
					};
					elCtx.update = (newContent: string) => {
						resultHtml = newContent;
						elCtx.content = newContent;
					};
					elCtx.replace = (replacement: string) => {
						resultHtml = resultHtml.replace(m.full, replacement);
						elCtx.content = resultHtml;
					};
					elCtx.replaceContent = (replacement: string) => {
						if (!isVoid) {
							const newOuter = m.full.replace(m.inner!, replacement);
							resultHtml = resultHtml.replace(m.full, newOuter);
							elCtx.content = resultHtml;
						}
					};

					await def.onCall(elCtx);

					if (elCtx.content !== resultHtml) {
						resultHtml = elCtx.content;
					}
				}
			}
		}

		return resultHtml;
	}
}