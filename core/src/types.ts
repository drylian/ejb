import type { Kire } from "./kire";

export type KireCache<T = any> = Map<string, T>;

export interface KireConfig {
	globals?: Record<string, any>;
	// Add other config options as needed
}

export interface IParser {
	parse(): Node[];
}
export type IParserConstructor = new (template: string, kire: Kire) => IParser;

export interface ICompiler {
	compile(nodes: Node[]): Promise<string>;
}
export type ICompilerConstructor = new (kire: Kire) => ICompiler;

/**
 * Options for configuring the Kire instance.
 */
export interface KireOptions {
	/**
	 * The root directory for resolving file paths. Defaults to "./".
	 */
	root?: string;
	/**
	 * Whether to run in production mode (enables caching). Defaults to true.
	 */
	production?: boolean;
	/**
	 * Custom file resolver function.
	 */
	resolver?: (filename: string) => Promise<string>;
	/**
	 * Path aliases for imports (e.g., { "~/": "./src/" }).
	 */
	alias?: Record<string, string>;
	/**
	 * Default file extension for templates. Defaults to "kire".
	 */
	extension?: string;
	/**
	 * Whether to load default directives. Defaults to true.
	 */
	directives?: boolean;
	/**
	 * List of plugins to load.
	 */
	plugins?: (KirePlugin | [KirePlugin, any])[];
	/**
	 * Custom engine components.
	 */
	engine?: {
		parser?: IParserConstructor;
		compiler?: ICompilerConstructor;
	};
	/**
	 * Name of the variable exposing locals in the template. Defaults to "it".
	 */
	varLocals?: string;
	/**
	 * Whether to expose locals as a specific variable (defined by varLocals).
	 */
	exposeLocals?: boolean;
}

/**
 * The runtime context object ($ctx) used during template execution.
 */
export interface KireContext {
	/**
	 * The accumulated string buffer for the local scope's output.
	 */
	'~res': string;
	
	/**
	 * A global buffer for code or functions to be executed *before* the main entry point's rendering logic.
	 */
	'~$pre': Function[];
	
	/**
	 * A global buffer for code or functions to be executed *after* the main entry point's rendering logic.
	 */
	'~$pos': Function[];

	/**
	 * Appends content to the current output buffer (~res).
	 * @param str The content to append.
	 */
	res(str: string): void;

	/**
	 * Returns the current output buffer content.
	 */
	$res(): string;

	/**
	 * Resolves a file path relative to the project root and aliases.
	 */
	$resolve(path: string): string;

	/**
	 * Creates a new isolation scope for capturing output (e.g. for slots or defines).
	 * @param func The function to execute within the merged scope.
	 */
	$merge(func: (ctx: KireContext) => Promise<void>): Promise<void>;

	/**
	 * Imports and renders another .kire template.
	 */
	$require?(path: string, locals?: Record<string, any>): Promise<string | null>;

	/**
	 * Helper for MD5 hashing.
	 */
	$md5?(str: string): string;

	/**
	 * Helper for HTML escaping.
	 */
	$escape?(unsafe: any): string;

	/**
	 * Arbitrary locals and globals.
	 */
	[key: string]: any;
}

/**
 * The context object passed to directives during compilation.
 * Renamed from KireContext to CompilerContext to avoid confusion with the runtime context.
 */
export interface CompilerContext {
	/**
	 * Kire instance
	 */
	kire:Kire;
	/**
	 * Retrieves a parameter passed to the directive.
	 * @param name The name or index of the parameter.
	 */
	param(name: string | number): any;
	
	/**
	 * Compiles a string of Kire template content.
	 * @param content The template string to compile.
	 * @returns The compiled function code as a string.
	 */
	render(content: string): Promise<string>;

	/**
	 * Wraps the provided code in an async function definition.
	 * @param code The function body.
	 */
	func(code: string): string;
	
	// --- Local Function Scope ---

	/**
	 * Pushes code to be executed *before* the local rendering result accumulation begins.
	 * Useful for variable declarations or setup logic.
	 */
	pre(code: string): void;

	/**
	 * Appends code that adds content to the local result buffer (~res).
	 * @param content The raw content to append.
	 */
	res(content: string): void;

	/**
	 * Pushes raw code directly into the main execution flow of the compiled function.
	 * @param code The JavaScript code to inject.
	 */
	raw(code: string): void;

	/**
	 * Pushes code to be executed *after* the local rendering result accumulation ends.
	 * Useful for post-processing the result (replacements) or cleanup.
	 */
	pos(code: string): void;
	
	// --- Global Scope (Main File) ---

	/**
	 * Pushes code to the global pre-processing stack (~$pre).
	 * These functions run before the main entry point's rendering logic.
	 */
	$pre(code: string): void;

	/**
	 * Pushes code to the global post-processing stack (~$pos).
	 * These functions run after the main entry point's rendering logic has finished.
	 */
	$pos(code: string): void;

	/**
	 * Throws a compilation error with a specific message.
	 */
	error(message: string): void;

	/**
	 * Resolves a file path relative to the project root and aliases.
	 */
	resolve(path: string): string;

	// --- Compiler State Inspection ---
	// These properties allow checking the current state of the compilation buffers.

	/**
	 * The current content of the local result buffer code.
	 */
	'~res'?: string;

	/**
	 * The current content of the local pre-processing buffer code.
	 */
	'~pre'?: string[]; // Changed to string[] because it's a buffer of code lines in the compiler

	/**
	 * The current content of the local post-processing buffer code.
	 */
	'~pos'?: string[]; // Changed to string[] because it's a buffer of code lines in the compiler

	/**
	 * The current content of the global pre-processing buffer code.
	 */
	'~$pre'?: string[];

	/**
	 * The current content of the global post-processing buffer code.
	 */
	'~$pos'?: string[];

	// --- Nesting & Structure ---

	/**
	 * The children nodes of the current directive (for block directives).
	 */
	children?: Node[];

	/**
	 * Related nodes, such as chained directives (e.g., elseif, else).
	 */
	parents?: Node[]; 

	/**
	 * Compiles and processes a set of nodes, appending their logic to the current flow.
	 */
	set(nodes: Node[]): Promise<void>;
}

/**
 * Context provided to element handlers (middleware) for manipulating HTML output.
 */
export interface KireElementContext extends KireContext {
	/**
	 * The current global HTML content string. This is mutable and represents the state of the document.
	 */
	content: string;
	
	/**
	 * Typed $ctx context use key of $ctx context with you type
	 * @param key 
	 */
	$typed<T>(key:string): T;

	/**
	 * Details about the specific HTML element being processed.
	 */
	element: {
		/**
		 * The tag name of the element (e.g., "div", "custom-tag").
		 */
		tagName: string;
		/**
		 * A map of the element's attributes.
		 */
		attributes: Record<string, string>;
		/**
		 * The inner HTML content of the element.
		 */
		inner: string;
		/**
		 * The full outer HTML of the element (including tags).
		 */
		outer: string;
	};

	/**
	 * Updates the entire global HTML content.
	 * @param newContent The new HTML content string.
	 */
	update(newContent: string): void;

	/**
	 * Replaces the current element's outer HTML in the global content.
	 * @param replacement The string to replace the element with.
	 */
	replace(replacement: string): void;

	/**
	 * Replaces the current element's outer HTML in the global content.
	 * @param replacement The string to replace the element with.
	 */
	replaceElement(replacement: string): void;

	/**
	 * Replaces the current element's inner HTML in the global content.
	 * @param replacement The string to replace the inner content with.
	 */
	replaceContent(replacement: string): void;
}

export type KireElementHandler = (
	ctx: KireElementContext,
) => Promise<void> | void;

export interface KireElementOptions {
	/**
	 * Whether the element is a void element (self-closing, no closing tag).
	 */
	void?: boolean;
}

export interface ElementDefinition {
	name: string | RegExp;
	description?: string;
	example?: string;
	void?: boolean;
	onCall: KireElementHandler;
}

/**
 * Definition of a custom directive.
 */
export interface DirectiveDefinition {
	/**
	 * The name of the directive (used as @name).
	 */
	name: string;
	/**
	 * Parameter definitions (e.g., ['filepath:string']).
	 */
	params?: string[]; 
	/**
	 * Whether this directive accepts a block ending with @end.
	 * If "auto", the parser checks for a matching @end tag to decide.
	 */
	children?: boolean | "auto"; 
	/**
	 * Should the children be treated as raw text instead of parsed nodes?
	 */
	childrenRaw?: boolean; 
	/**
	 * Sub-directives associated with this one (e.g., elseif, else for @if).
	 */
	parents?: DirectiveDefinition[]; 
	/**
	 * Function called when the directive is encountered during compilation.
	 */
	onCall: (compiler: CompilerContext) => void | Promise<void>;
	/**
	 * Function called once per compilation when the directive is first used.
	 */
	onInit?: (ctx: KireContext) => void | Promise<void>;
	
	description?: string;
	example?: string;
	/**
	 * The type of logic this directive handles (css, js, or html structure).
	 */
	type?: "css" | "js" | "html";
}

export interface KireSchematic {
	package: string;
	repository?: string | { type: string; url: string };
	version?: string;
	directives?: DirectiveDefinition[];
	elements?: ElementDefinition[];
	globals?: Record<string, any>;
}

export interface KirePlugin<Options extends object | undefined = {}> {
	name: string;
	sort?: number;
	options: Options;
	load(kire: Kire, opts?: Options): void;
}

// AST Types
export type NodeType = "text" | "variable" | "directive";

export interface SourceLocation {
	line: number;
	column: number;
}

export interface Node {
	type: NodeType;
	content?: string;
	name?: string; // For directives
	args?: any[]; // For directives
	start?: number;
	end?: number;
	loc?: {
		start: SourceLocation;
		end: SourceLocation;
	};
	children?: Node[]; // Inner content
	related?: Node[]; // For 'parents' (elseif, etc)
	raw?: boolean;
}
