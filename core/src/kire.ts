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
import { join } from "./utils/path";

export class Kire {
	public directives: Map<string, DirectiveDefinition> = new Map();
	public elements: Set<ElementDefinition> = new Set();
	public globalContext: Map<string, any> = new Map();

	public root: string;
	public production: boolean;
	public resolverFn: (filename: string) => Promise<string>;
	public readDirFn?: (pattern: string) => Promise<string[]>;
	public alias: Record<string, string>; extension: string;
	public cacheFiles: Map<string, Function> = new Map();
	public parserConstructor: IParserConstructor;
	public compilerConstructor: ICompilerConstructor;
	public varLocals: string;
	public exposeLocals: boolean;

	private _cacheStore: Map<string, Map<string, any>> = new Map();

	public get $cache() {
		return {
			clear: () => this._cacheStore.clear(),
		};
	}

	public cacheClear() {
		this._cacheStore.clear();
		this.cacheFiles.clear();
	}

	public cached<T = any>(namespace: string): KireCache<T> {
		if (!this._cacheStore.has(namespace)) {
			this._cacheStore.set(namespace, new Map());
		}
		const store = this._cacheStore.get(namespace)!;
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
		this.varLocals = options.varLocals ?? "it";
		this.exposeLocals = options.exposeLocals ?? true;

		this.resolverFn =
			options.resolver ??
			(async (filename) => {
				throw new Error(`No resolver defined for path: ${filename}`);
			});

		this.parserConstructor = options.engine?.parser ?? Parser;
		this.compilerConstructor = options.engine?.compiler ?? Compiler;

		// Register internal helpers
		this.$ctx("md5", md5);
		this.$ctx("~$pre", []);
		this.$ctx("~$pos", []);
		this.$ctx(
			"require",
			async (path: string) => {
				const cached = this.cached("@kirejs/core");
				const isProd = this.production;
				const hash = cached.get(`md5:${path}`);
				let content = "";

				if (!hash || !isProd) {
					try {
						content = await this.resolverFn(path);
					} catch (e: any) {
						if (!e.message.includes("No resolver")) {
							console.warn(`Failed to resolve path: ${path}`, e);
						}
						return null;
					}

					if (!content) {
						return null;
					}

					const ihash = md5(content);

					if (!isProd && hash) {
						if (ihash === hash) {
							return cached.get(`js:${path}`);
						}
						else {
							cached.delete(`md5:${path}`);
							cached.delete(`js:${path}`);
						}
					}

					const fn = await this.compileFn(content);
					cached.set(`md5:${path}`, ihash);
					cached.set(`js:${path}`, fn);
					return fn;
				} else {
					return cached.get(`js:${path}`);
				}
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
		this.globalContext.forEach((value, key) => {
			globals[key] = value;
		});

		return {
			package: name,
			repository,
			version,
			directives: Array.from(this.directives.values()),
			elements: Array.from(this.elements.values()),
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
			this.elements.add(nameOrDef as ElementDefinition);
		} else {
			if (!handler) throw new Error("Handler is required for legacy element()")
			this.elements.add({
				name: nameOrDef as string | RegExp,
				void: options?.void,
				onCall: handler,
			});
		}
		return this;
	}

	public directive(def: DirectiveDefinition) {
		this.directives.set(def.name, def);
		if (def.parents) {
			for (const parent of def.parents) {
				this.directive(parent);
			}
		}
		return this;
	}

	public getDirective(name: string) {
		return this.directives.get(name);
	}

	public $ctx(key: string, value: any) {
		this.globalContext.set(key, value);
		return this;
	}

	public parse(template: string) {
		const parser = new this.parserConstructor(template, this);
		return parser.parse();
	}

	public async compile(template: string): Promise<string> {
		const parser = new this.parserConstructor(template, this);
		const nodes = parser.parse();
		const compiler = new this.compilerConstructor(this);
		return compiler.compile(nodes);
	}

	public resolvePath(filepath: string, currentFile?: string): string {
		if (!filepath) return filepath;

		if (filepath.startsWith("http://") || filepath.startsWith("https://")) {
			return filepath;
		}

		let resolved = filepath.replace(/\\/g, "/").replace(/(?<!:)\/+/g, "/");
		const root = this.root.replace(/\\/g, "/").replace(/\/$/, "");

		const isWindowsAbsolute = /^[a-zA-Z]:\//.test(resolved);

		const aliases = Object.entries(this.alias);
		aliases.sort((a, b) => b[0].length - a[0].length);

		let matchedAlias = false;
		for (const [alias, replacement] of aliases) {
			const escapedAlias = alias.replace(/[.*+?^${}()|[\\]/g, "\\$& ");
			if (new RegExp(`^${escapedAlias}`).test(filepath)) {
				resolved = join(replacement, filepath.slice(alias.length));
				matchedAlias = true;
				break;
			}
		}

		if (matchedAlias) {
			// handled
		} else {
			const isResolvedAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(resolved);
			if (!isResolvedAbsolute && !isWindowsAbsolute) {
				const base = currentFile
					? currentFile.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
					: root;
				resolved = join(base, resolved);
			}
		}

		if (
			this.extension &&
			!/\.[^/.]+$/.test(resolved) &&
			!(resolved.startsWith("http://") || resolved.startsWith("https://"))
		) {
			const ext =
				this.extension.charAt(0) === "."
					? this.extension
					: `.${this.extension}`;
			resolved += ext;
		}

		return resolved.replace(/\/+/g, "/");
	}

	public async compileFn(content: string): Promise<Function> {
		const code = await this.compile(content);
		try {
			const AsyncFunction = Object.getPrototypeOf(async () => { }).constructor;

			const mainFn = new AsyncFunction("$ctx", code);

			return async ($ctx: any) => {
				await mainFn($ctx);
				return $ctx;
			};
		} catch (e) {
			console.error("Error creating function from code:", code);
			throw e;
		}
	}

	public async render(
		template: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		const fn = await this.compileFn(template);
		return this.run(fn, locals);
	}

	public async view(
		path: string,
		locals: Record<string, any> = {},
	): Promise<string> {
		const resolvedPath = this.resolvePath(path);
		let fn: Function | undefined;

		if (this.production && this.cacheFiles.has(resolvedPath)) {
			fn = this.cacheFiles.get(resolvedPath);
		} else {
			try {
				const content = await this.resolverFn(resolvedPath);
				fn = await this.compileFn(content);
				if (this.production) {
					this.cacheFiles.set(resolvedPath, fn);
				}
			} catch (e) {
				throw e;
			}
		}

		if (!fn) throw new Error(`Could not load view: ${path}`);
		return this.run(fn, locals);
	}

	private async run(fn: Function, locals: Record<string, any>): Promise<string> {
		const rctx: any = {};
		for (const [k, v] of this.globalContext) {
			rctx[k] = v;
		}
		Object.assign(rctx, locals);

		if (this.exposeLocals) {
			rctx[this.varLocals] = locals;
		}

		// Reset arrays for this request to avoid sharing global instance
		rctx['~res'] = "";
		rctx['~$pre'] = [];
		rctx['~$pos'] = [];

		rctx.res = function (this: any, str: any) {
			rctx['~res'] += str;
		};

		rctx.$res = () => rctx['~res'];

		rctx.resolve = (path: string) => {
			return this.resolvePath(path);
		};

		rctx.$merge = async function (this: any, func: Function) {
			const parentRes = this['~res'];
			this['~res'] = "";
			await func(this);
			this['~res'] = parentRes + this['~res'];
		};

		const fctx = await fn(rctx);

		// Execute ~$pre functions collected during execution
		if (fctx['~$pre'] && fctx['~$pre'].length > 0) {
			for (const preFn of fctx['~$pre']) {
				await preFn(rctx);
			}
		}

		let resultHtml = fctx['~res'];
		if (this.elements.size > 0) {
			for (const def of this.elements) {
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
						`<(${tagName})([^>]*)>([\\s\\S]*?)<\\/\\1>`,
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

		// Execute ~$pos functions (deferred logic)
		if (fctx['~$pos'] && fctx['~$pos'].length > 0) {
			for (const posFn of fctx['~$pos']) {
				await posFn(rctx);
			}
			// Update resultHtml if ~$pos modified ~res (e.g. @defined replacement)
			resultHtml = fctx['~res'];
		}

		return resultHtml;
	}
}
