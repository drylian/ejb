import type { EjbDirectivePlugin } from "./types";
export const EJB_DEFAULT_PREFIX_GLOBAL = 'it';
export const EJB_DEFAULT_PREFIX_DIRECTIVE = '@';
export const EJB_DEFAULT_PREFIX_VARIABLE = '{*}';
export const ESCAPE_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', };
export const ESPACE_HTML_REGEX = /[&<>"']/g;
export const EJB_HEAD_DIRECTIVE_REPLACER = '<!--$EJB-HEAD-REPLACER-->'
export enum EjbAst {
    Root,
    Text,
    Interpolation,
    Directive,
}

export function ejbDirective(opts: EjbDirectivePlugin) {
    return {
        [opts.name]: opts
    }
}