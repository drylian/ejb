import type { Kire } from "./kire";

export interface KireCache<T = any> {
	get(key: string): T | undefined;
	set(key: string, value: T): void;
	has(key: string): boolean;
	delete(key: string): boolean;
	clear(): void;
	entries(): IterableIterator<[string, T]>;
}

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

export interface KireOptions {
	root?: string;
	production?: boolean;
	resolver?: (filename: string) => Promise<string>;
	alias?: Record<string, string>;
	extension?: string;
	directives?: boolean;
	plugins?: (KirePlugin | [KirePlugin, any])[];
	engine?: {
		parser?: IParserConstructor;
		compiler?: ICompilerConstructor;
	};
	varLocals?: string;
	exposeLocals?: boolean;
}

export interface KireContext {
	param(name: string | number): any;
	render(content: string): Promise<string>; // Returns compiled function string
	func(code: string): string; // Wraps code in a function definition
	
	// Local function scope
	pre(code: string): void;
	res(content: string): void;
	raw(code: string): void;
	pos(code: string): void;
	
	// Global scope (Main file)
	$pre(code: string): void;
	$pos(code: string): void;

	error(message: string): void;
	resolve(path: string): string;

	// For nested directives
	children?: Node[];
	parents?: Node[]; // The instances of sub-directives (e.g., elseif blocks)
	set(nodes: Node[]): Promise<void>;
}

export interface KireElementContext {
	content: string; // The global HTML content (mutable/readable state representation)
	element: {
		tagName: string;
		attributes: Record<string, string>;
		inner: string;
		outer: string;
	};
	// Method to update the global content
	update(newContent: string): void;
	replace(replacement: string): void;
	replaceContent(replacement: string): void;
}

export type KireElementHandler = (
	ctx: KireElementContext,
) => Promise<void> | void;

export interface KireElementOptions {
	void?: boolean;
}

export interface ElementDefinition {
	name: string | RegExp;
	description?: string;
	example?: string;
	void?: boolean;
	onCall: KireElementHandler;
}

export interface DirectiveDefinition {
	name: string;
	params?: string[]; // e.g. ['filepath:string']
	children?: boolean; // Does this directive accept a block ending with @end?
	childrenRaw?: boolean; // Should the children be treated as raw text?
	parents?: DirectiveDefinition[]; // Sub-directives like elseif/else
	onCall: (ctx: KireContext) => void | Promise<void>;
	once?: (ctx: KireContext) => void | Promise<void>;
	description?: string;
	example?: string;
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
