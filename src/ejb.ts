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
	EjbError,
} from "./types";
import {
	AsyncFunction,
	escapeHtml,
	escapeJs,
	escapeRegExp,
	escapeString,
	filepathResolver,
} from "./utils";

/**
 * EJB Template Engine class
 */
export class Ejb {
	/** File resolver function */
	public resolver: EjbContructor["resolver"];
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

	/** expose global keys in file, example: it.exemple -> it.exemple | exemple */
	public globalexpose: boolean;

	/** Stores errors during compilation */
	public errors: EjbError[] = [];

	/**
	 * Returns the appropriate function constructor (AsyncFunction or Function)
	 * based on async mode
	 * @returns {FunctionConstructor} The function constructor to use
	 */
	public getFunction = () => AsyncFunction;

	/** Registered directives */
	public directives: EjbContructor["directives"] = {};

	/**
	 * Compiles a template into a function string that can be executed later
	 * @param template - Template string or path to template file
	 * @returns The generated function code as string (wrapped in Promise if async)
	 */
	public async makeFunction(template: string): Promise<string> {
		this.errors = [];
		const isPotentialPath = this.isTemplatePath(template);

		const processTemplate = async (content: string): Promise<string> => {
			const ast = ejbParser(this, content);
			if (ast.errors.length) {
				this.errors.push(...ast.errors);
			}
			const codeResult = await compile(this, ast);

			const buildFunctionCode = (compiledCode: string): string => {
				if (this.errors.length > 0) {
					const errorContent = JSON.stringify(
						this.errors.map((e) => ({
							message: e.stack || e.message,
							loc: e.loc,
						})),
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
                        EjbFunction: async function() { 
                            return new (async () => {}).constructor.apply(null, arguments);
                        }
                    };
                    
                    ${compiledCode}
                }.bind(this);
            `;
			};

			return buildFunctionCode(codeResult);
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
	public parser(code: string) {
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
		const isPotentialPath = this.isTemplatePath(template);

		if (isPotentialPath) {
			try {
				const resolvedPath = filepathResolver(this, template);
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

		const ast = ejbParser(this, template);
		if (ast.errors.length) {
			this.errors.push(...ast.errors);
		}
		const codeResult = await compile(this, ast);
		//console.log(codeResult)
		const execute = (code: string) => {
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

		if (this.errors.length > 0) {
			const errorMessages = this.errors
				.map((e) => e.stack || e.message)
				.join("\n\n");
			this.errors = [];
			return errorMessages;
		}
		const result = await execute(codeResult);
		return result.res;
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

		this.directives = Object.assign({}, DEFAULT_DIRECTIVES, opts.directives);

		this.globalvar = opts?.globalvar ?? EJB_DEFAULT_PREFIX_GLOBAL;
	}
}
