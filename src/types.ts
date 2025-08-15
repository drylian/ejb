import type { EjbAst } from "./constants";
import type { Ejb } from "./ejb";

/**
 * Conditional type that returns Promise<T> if Async is true, otherwise T
 * @template Async - Boolean indicating if the operation is async
 * @template T - The type to wrap in Promise or return directly
 */
export type IfAsync<Async extends boolean, T> = Async extends true ? Promise<T> : T;

/** Type representing any Ejb instance (sync or async) */
export type AnyEjb = Ejb<boolean>;

/** Type representing a value that can be either the type or a Promise of the type */
export type EjbAnyReturn<type> = type | Promise<type>;

/**
 * Interface for Ejb constructor options
 * @template Async - Boolean indicating if the instance should work in async mode
 */
export interface EjbContructor<Async extends boolean> {
    /** Path aliases mapping */
    aliases: Record<string, string>;
    /** Default file extension */
    extension: string;
    /** Async mode flag */
    async: Async;
    /** Root directory for file resolution */
    root: string;
    /** File resolver function */
    resolver: (path: string) => IfAsync<Async, string>;
    /** Global variables available in templates */
    globals: Record<string, any>;
    /** Registered directives */
    directives: Record<string, EjbDirectivePlugin>;
    /** Prefix configuration */
    prefix: {
        /** Directive prefix (default '@') */
        directive: string;
        /** Variable interpolation prefix (default '{{*}}') */
        variable: string;
        /** Global variable prefix (default 'it') */
        global: string;
    }
}

/**
 * Context object available during template execution
 */
export interface EjbFunctionContext {
    /** Ejb instance */
    ins: AnyEjb;
    /** Result buffer */
    res: string;
    /** HTML escaping function */
    escapeHtml: (str: string) => string;
    /** JavaScript escaping function */
    escapeJs: (str: string) => string;
    /** Function constructor (sync or async) */
    EjbFunction: (...args: any[]) => any;
}

/**
 * Context for directive children processing
 */
export interface EjbChildrenContext {
    /** Child nodes */
    children: AstNode[];
    /** Parent directive names (for nested directives) */
    parents?: string;
}

/**
 * Base interface for directive definitions
 */
export interface EjbDirectiveBasement {
    /** Directive name */
    name: string;
    /**
     * Handler for directive parameters
     * @param ejb - Ejb instance
     * @param expression - Directive expression content
     * @returns Code to insert or Promise of code
     */
    onParams?: (ejb: AnyEjb, expression: string) => EjbAnyReturn<string | undefined>;
    /**
     * Handler for directive children
     * @param ejb - Ejb instance
     * @param opts - Children context
     * @returns Code to insert or Promise of code
     */
    onChildren?: (ejb: AnyEjb, opts: EjbChildrenContext) => EjbAnyReturn<string>;
    /**
     * Initialization handler
     * @param ejb - Ejb instance
     * @returns Code to insert or Promise of code
     */
    onInit?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    /**
     * Finalization handler
     * @param ejb - Ejb instance
     * @returns Code to insert or Promise of code
     */
    onEnd?: (ejb: AnyEjb) => EjbAnyReturn<string>;
}

/**
 * Interface for parent directives that can have sub-directives
 */
export interface EjbDirectiveParent extends EjbDirectiveBasement {
    /** Flag indicating this is an internal directive */
    internal?: boolean;
    /** Flag indicating this directive requires an @end */
    withend?: boolean;
}

/**
 * Interface for complete directive plugin definition
 */
export interface EjbDirectivePlugin extends EjbDirectiveBasement {
    /** Flag indicating this directive can have children */
    children?: boolean;
    /** Processing priority (higher runs first) */
    priority?: number;
    /** Available sub-directives */
    parents?: EjbDirectiveParent[];
    /**
     * File-level initialization handler
     * @param ejb - Ejb instance
     * @returns Code to insert or Promise of code
     */
    onInitFile?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    /**
     * File-level finalization handler
     * @param ejb - Ejb instance
     * @returns Code to insert or Promise of code
     */
    onEndFile?: (ejb: AnyEjb) => EjbAnyReturn<string>;
}

/** Union type of all possible AST node types */
export type AstNode = RootNode | TextNode | DirectiveNode | InterpolationNode | SubDirectiveNode;

/** Base interface for all AST nodes */
export interface AstNodeBase {
    /** Node type identifier */
    type: EjbAst;
}

/** Root node of the AST */
export interface RootNode extends AstNodeBase {
    type: EjbAst.Root;
    /** Child nodes */
    children: AstNode[];
}

/** Text content node */
export interface TextNode extends AstNodeBase {
    type: EjbAst.Text;
    /** Text content */
    value: string;
}

/** Directive node */
export interface DirectiveNode extends AstNodeBase {
    type: EjbAst.Directive;
    /** Directive name */
    name: string;
    /** Directive expression */
    expression: string;
    /** Child nodes */
    children: AstNode[];
    /** Flag indicating if directive was auto-closed */
    autoClosed: boolean;
}

/** Interpolation node */
export interface InterpolationNode extends AstNodeBase {
    type: EjbAst.Interpolation;
    /** Expression to evaluate */
    expression: string;
    /** Flag indicating if output should be HTML-escaped */
    escaped: boolean;
}

/** Sub-directive node */
export interface SubDirectiveNode extends AstNodeBase {
    type: EjbAst.SubDirective;
    /** Directive name */
    name: string;
    /** Directive expression */
    expression: string;
    /** Child nodes */
    children: AstNode[];
    /** Parent directive name */
    parentName: string;
    /** Flag indicating if directive was auto-closed */
    autoClosed: boolean;
}