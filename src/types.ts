import type { EjbAst } from "./constants";
import type { Ejb } from "./ejb";

// Adiciona o tipo condicional
export type IfAsync<Async extends boolean, T> = Async extends true ? Promise<T> : T;

export type AnyEjb = Ejb<boolean>;
export type EjbAnyReturn<type> = type | Promise<type>;
export interface EjbContructor<Async extends boolean> {
    aliases: Record<string, string>;
    extension: string;
    async: Async;
    root: string;
    resolver: (path: string) => IfAsync<Async, string>;
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

export interface EjbChildrenContext {
    children: AstNode[];
}

export interface EjbDirectiveBasement {
    name: string;
    onParams?: (ejb: AnyEjb, expression: string) => EjbAnyReturn<string | undefined>;
    onChildren?: (ejb: AnyEjb, opts: EjbChildrenContext) => EjbAnyReturn<string>;
}

export interface EjbDirectiveParent extends EjbDirectiveBasement {
    onInit?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    onEnd?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    internal?: boolean;
};
export interface EjbDirectivePlugin extends EjbDirectiveBasement {
    children?: boolean;
    childrenRaw?: boolean;
    priority?: number;
    parents?: EjbDirectiveParent[];
    onInitFile?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    onEndFile?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    onInit?: (ejb: AnyEjb) => EjbAnyReturn<string>;
    onEnd?: (ejb: AnyEjb) => EjbAnyReturn<string>;
}

export type AstNode = RootNode | TextNode | DirectiveNode | InterpolationNode | SubDirectiveNode;

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

export interface SubDirectiveNode extends AstNodeBase {
    type: EjbAst.SubDirective;
    name: string;
    expression: string;
    children: AstNode[];
    parentName: string;
}
