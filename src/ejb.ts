import { compile, generateNodeCode, generateNodeString } from "./compiler";
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
	IfAsync,
	EjbError,
} from "./types";
import {
	AsyncFunction,
	escapeHtml,
	escapeJs,
	escapeRegExp,
	escapeString,
	filepathResolver,
	isPromise,
} from "./utils";

/**
 * EJB Template Engine class
 * @template Async - Boolean indicating if the instance should work in async mode
 */
export class Ejb<Async extends boolean = false> {
	/** File resolver function */
	public resolver: EjbContructor<Async>["resolver"];
	/** Default file extension */
	public extension: EjbContructor<Async>["extension"];
	/** Global variables available in templates */
	public globals: EjbContructor<Async>["globals"];
	/** Prefix configuration */
	public globalvar: EjbContructor<Async>["globalvar"];
	/** Path aliases mapping */
	public aliases: EjbContructor<Async>["aliases"];
	/** Root directory for file resolution */
	public root: EjbContructor<Async>["root"];

	/** expose global keys in file, example: it.exemple -> it.exemple | exemple */
	public globalexpose: boolean;

	/** Async mode flag */
	public async;

	/** Stores errors during compilation */
	public errors: EjbError[] = [];

	/**
	 * Returns the appropriate function constructor (AsyncFunction or Function)
	 * based on async mode
	 * @returns {FunctionConstructor} The function constructor to use
	 */
	public getFunction = () => (this.async ? AsyncFunction : Function);

	/** Registered directives */
	public directives: EjbContructor<Async>["directives"] = {};

	/**
	 * Compiles a template into a function string that can be executed later
	 * @param template - Template string or path to template file
	 * @returns The generated function code as string (wrapped in Promise if async)
	 */
	public makeFunction(template: string): IfAsync<Async, string> {
		this.errors = [];
		const isPotentialPath = this.isTemplatePath(template);

		const processTemplate = (content: string): IfAsync<Async, string> => {
			const ast = ejbParser(this, content);
			if (ast.errors.length) {
				this.errors.push(...ast.errors);
			}
			const codeResult = compile(this, ast);

			const buildFunctionCode = (compiledCode: string): string => {
				if (this.errors.length > 0) {
					const errorContent = JSON.stringify(
						this.errors.map((e) => ({ message: e.stack || e.message, loc: e.loc })),
					);
					return `return () => { const err = new Error('EJB compilation failed'); err.details = ${errorContent}; throw err; }`;
				}
				return `
                return function(${this.globalvar}) {
                    const $ejb = {
                        ins: this,
                        res: '',
                        escapeHtml: ${escapeHtml.toString()},
                        escapeJs: ${escapeJs.toString()},
                        EjbFunction: ${this.async ? "async" : ""} function() { 
                            return ${this.async ? "new (async () => {}).constructor" : "Function"}.apply(null, arguments);
                        }
                    };
                    
                    ${compiledCode}
                }.bind(this);
            `;
			};

			if (isPromise(codeResult)) {
				if (!this.async) {
					throw new Error("[EJB] Async compilation in sync mode");
				}
				return codeResult.then((compiledCode) =>
					buildFunctionCode(compiledCode),
				) as IfAsync<Async, string>;
			}

			return buildFunctionCode(codeResult as string) as IfAsync<Async, string>;
		};

			if (isPotentialPath) {
				try {
					const resolvedPath = filepathResolver(this, template);
					const resolvedContent = this.resolver?.(resolvedPath) ?? template;

					if (isPromise(resolvedContent)) {
						if (!this.async) {
							throw new Error("[EJB] Async template loading in sync mode");
						}
						return (async () => {
								const content = await resolvedContent;
								return processTemplate(content as string);
						})() as unknown as IfAsync<Async, string>;
					}

					return processTemplate(resolvedContent as string);
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
	public compileNode(
		node: AstNode | AstNode[],
		stringMode = false,
	): IfAsync<Async, string> {
		const nodes = Array.isArray(node) ? node : [node];
		const generator = stringMode ? generateNodeString : generateNodeCode;

		const codes: (string | Promise<string>)[] = nodes.map((_node) =>
			generator(this, _node),
		);

		const hasPromises = codes.some(isPromise);

		if (!hasPromises) {
			return codes.join("") as IfAsync<Async, string>;
		}
		if (!this.async) {
			throw new Error(
				"[EJB] Async node compilation in sync mode. Enable async or use sync directives.",
			);
		}
		return Promise.all(codes).then((resolvedCodes) =>
			resolvedCodes.join(""),
		) as IfAsync<Async, string>;
	}

	/**
	 * Parses template string into AST
	 * @param code - Template string to parse
	 * @returns Root AST node
	 */
	public parserAst(code: string) {
		return ejbParser(this, code);
	}

	/**
	 * Renders a template with provided locals
	 * @param template - Template string or path to template file
	 * @param locals - Variables to make available during rendering
	 * @returns Rendered output (wrapped in Promise if async)
	 */
	public render(
		template: string,
		locals: Record<string, any> = {},
	): IfAsync<Async, string> {
		this.errors = [];
		const isPotentialPath = this.isTemplatePath(template);

		if (isPotentialPath) {
			try {
				const resolvedPath = filepathResolver(this, template);
				const resolvedContent = this.resolver?.(resolvedPath) ?? template;

				if (isPromise(resolvedContent)) {
					if (!this.async) {
						throw new Error("[EJB] Async template loading in sync mode");
					}
					return (async () => {
							const content = await resolvedContent;
							return this.render(content as string, locals);
						})() as unknown as IfAsync<Async, string>;
				}

				template = resolvedContent as string;
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

		const ast = ejbParser(this, template);
		if (ast.errors.length) {
			this.errors.push(...ast.errors);
		}
		const codeResult = compile(this, ast);

		const execute = (code: string) => {
			//console.log(code);
			const executor = new (this.getFunction())("$ejb", this.globalvar, code);
			return executor(
				{
					ins: this,
					res: "",
					escapeHtml,
					escapeJs,
					escapeString,
					EjbFunction: this.getFunction(),
				},
				{ ...this.globals, ...locals },
			);
		};

		if (this.async) {
			return (async () => {
				const code = await Promise.resolve(codeResult);
				if (this.errors.length > 0) {
                    const errorMessages = this.errors.map((e) => e.stack || e.message).join("\n\n");
                    this.errors = [];
                    return errorMessages;
                }
				const result = await execute(code);
				return result.res;
			})() as IfAsync<Async, string>;
		} else {
			if (isPromise(codeResult)) {
				throw new Error(
					"[EJB] Compilation resulted in a Promise in sync mode. Use renderAsync or configure sync resolver/directives.",
				);
			}
			if (this.errors.length > 0) {
				const errorMessages = this.errors
					.map((e) => e.stack || e.message)
					.join("\n\n") as IfAsync<Async, string>;
				this.errors = [];
				return errorMessages;
			}
			const result = execute(codeResult as string);
			return result.res as IfAsync<Async, string>;
		}
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
	constructor(opts: Partial<EjbContructor<Async>> & { async?: Async } = {}) {
		this.aliases = opts.aliases ?? {};
		this.extension = opts.extension ?? "ejb";
		this.globals = opts.globals ?? {};
		this.async = (opts.async ?? false) as Async;
		this.root = opts.root ?? "./";
		this.globalexpose = opts.globalexpose ?? true;
		//@ts-expect-error ignore
		this.resolver =
			opts.resolver ??
			((path: string) => {
				const content = `[EJB]: Resolver not defined, but was required for path: ${path}`;
				if (this.async) {
					return Promise.reject(new Error(content));
				}
				throw new Error(content);
			});

		this.directives = Object.assign({}, DEFAULT_DIRECTIVES, opts.directives);

		this.globalvar = opts?.globalvar ?? EJB_DEFAULT_PREFIX_GLOBAL;
	}
}
