import { compile, generateNodeCode, generateNodeString } from "./compiler";
import {
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_GLOBAL,
	EJB_DEFAULT_PREFIX_VARIABLE,
	ejbDirective,
} from "./constants";
import { DEFAULT_DIRECTIVES } from "./directives";
import { ejbParser } from "./parser";
import type {
	AstNode,
	EjbContructor,
	EjbDirectivePlugin,
	IfAsync,
} from "./types";
import {
	AsyncFunction,
	escapeHtml,
	escapeJs,
	escapeRegExp,
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
	public prefix: EjbContructor<Async>["prefix"];
	/** Path aliases mapping */
	public aliases: EjbContructor<Async>["aliases"];
	/** Root directory for file resolution */
	public root: EjbContructor<Async>["root"];

	/** Async mode flag */
	public async;

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
		const isPotentialPath = this.isTemplatePath(template);

		const processTemplate = (content: string): IfAsync<Async, string> => {
			const ast = ejbParser(this, content);
			const codeResult = compile(this, ast);

			const buildFunctionCode = (compiledCode: string): string => {
				return `
                return function(${this.prefix.global}) {
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
		const codeResult = compile(this, ast);

		const execute = (code: string) => {
			const executor = new (this.getFunction())(
				"$ejb",
				this.prefix.global,
				code,
			);
			return executor(
				{
					ins: this,
					res: "",
					escapeHtml,
					escapeJs,
					EjbFunction: this.getFunction(),
				},
				{ ...this.globals, ...locals },
			);
		};

		if (this.async) {
			return (async () => {
				const code = await Promise.resolve(codeResult);
				const result = await execute(code);
				return result.res;
			})() as IfAsync<Async, string>;
		} else {
			if (isPromise(codeResult)) {
				throw new Error(
					"[EJB] Compilation resulted in a Promise in sync mode. Use renderAsync or configure sync resolver/directives.",
				);
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

		// Definitely not a path if it has multiple lines
		if (trimmed.split("\n").length > 1) {
			return false;
		}

		// Not a path if it's clearly a directive
		const directivePattern = new RegExp(
			`^\\s*${escapeRegExp(this.prefix.directive)}`,
		);
		if (directivePattern.test(trimmed)) {
			return false;
		}

		// Not a path if it contains template syntax
		const [interpStart] = (
			this.prefix.variable || EJB_DEFAULT_PREFIX_VARIABLE
		).split("*");
		if (trimmed.includes(interpStart)) {
			return false;
		}

		// Consider it a path if it contains path characters
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

		this.prefix = {
			global: EJB_DEFAULT_PREFIX_GLOBAL,
			directive: EJB_DEFAULT_PREFIX_DIRECTIVE,
			variable: EJB_DEFAULT_PREFIX_VARIABLE,
			...opts.prefix,
		};
	}
}
