import type { EjbAst } from "./constants";
import type { Ejb } from "./ejb";

// Adiciona o tipo condicional
export type IfAsync<Async extends boolean, T> = Async extends true ? Promise<T> : T;

export type AnyEjb = Ejb<boolean>;
export type EjbAnyReturn<type> = type | Promise<type>;
export interface EjbContructor {
    aliases: Record<string, string>;
    extension: string;
    async: boolean;
    resolver: (path: string) => EjbAnyReturn<string>;
    globals: Record<string, any>;
    directives: Record<string, EjbDirectivePlugin>;
    prefix: {
        directive: string;
        variable: string;
        global: string;
    }
}

export interface EjbFunctionContext {
    ins: AnyEjb;
    res: string;
    escapeHtml: (str: string) => string;
    escapeJs: (str: string) => string;
    EjbFunction: (...args: any[]) => any;
}

export interface EjbContext {
    code: string;
    end: (endstr: string) => void;
}

export interface EjbChildrenContext extends EjbContext {
    children: string;
}

export interface EjbDirectiveBasement { 
    name: string;
    onParams?: (ejb: AnyEjb, expression: string, opts: EjbContext) => EjbAnyReturn<string | undefined>;
    onChildren?: (ejb: AnyEjb, opts: EjbChildrenContext) => EjbAnyReturn<string>;
}

export interface EjbDirectiveParent extends EjbDirectiveBasement {};
export interface EjbDirectivePlugin extends EjbDirectiveBasement {
    children?: boolean;
    priority?:number;
    parents?: Record<string, EjbDirectiveParent>;
    onInitFile?: (ejb: AnyEjb, opts: Omit<EjbContext, 'compileNode'>) => EjbAnyReturn<string>;
    onEndFile?: (ejb: AnyEjb, opts: Omit<EjbContext, 'compileNode'>) => EjbAnyReturn<string>;
    onInit?: (ejb: AnyEjb, opts: EjbContext) => EjbAnyReturn<string>;
    onPre?: (ejb: AnyEjb, block: (endstr: string) => void) => EjbAnyReturn<unknown>;
    onEnd?: (ejb: AnyEjb, opts: EjbContext) => EjbAnyReturn<string>;
}

export type AstNode = RootNode | TextNode | DirectiveNode | InterpolationNode;

export interface AstNodeBase {
    type: EjbAst;
}

export interface RootNode extends AstNodeBase {
    type: EjbAst.Root;
    children: AstNode[];
}

export interface TextNode extends AstNodeBase {
    type: EjbAst.Text;
    value: string;
}

export interface DirectiveNode extends AstNodeBase {
    type: EjbAst.Directive;
    name: string;
    expression: string;
    children: AstNode[];
}

export interface InterpolationNode extends AstNodeBase {
    type: EjbAst.Interpolation;
    expression: string;
    escaped: boolean;
}