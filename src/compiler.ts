import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type { RootNode, AstNode, TextNode, InterpolationNode, DirectiveNode, EjbContext, IfAsync } from "./types";
import { escapeJs, isPromise } from "./utils";

function processChildren(ejb: Ejb<boolean>, children: AstNode[]): string | Promise<string> {
    if (!children.length) {
        return '';
    }
    const results = children.map(child => generateNodeCode(ejb, child));
    const promises = results.filter(isPromise);

    if (promises.length > 0) {
        if (!ejb.async) {
            throw new Error('[EJB] Asynchronous operation detected during child node processing in synchronous mode.');
        }
        return Promise.all(results).then(resolvedResults => resolvedResults.join(''));
    }
    return (results as string[]).join('');
}


export function generateNodeCode(ejb: Ejb<boolean>, node: AstNode): string | Promise<string> {
    switch (node.type) {
        case EjbAst.Root:
            return processChildren(ejb, node.children);
        
        case EjbAst.Text:
            return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n`;

        case EjbAst.Interpolation: {
            const { expression, escaped } = node as InterpolationNode;
            if (escaped) {
                return `$ejb.res += $ejb.escapeHtml(${expression});\n`;
            }
            return `$ejb.res += ${expression};\n`;
        }
        case EjbAst.Directive: {
            const { name, expression, children } = node as DirectiveNode;
            const directive = ejb.directives[name];

            if (!directive) {
                throw new Error(`[EJB] Directive not found: @${name}`);
            }

            const context: EjbContext = {
                code: '',
                end: () => {},
            };

            let codePromise: Promise<string> | string = '';

            // 1. onParams
            if (directive.onParams) {
                const result = directive.onParams(ejb, expression, context);
                if (isPromise(result)) {
                    if (!ejb.async) throw new Error(`[EJB] Directive '@${name}' is async (onParams) and cannot be used in sync mode.`);
                    codePromise = result as Promise<string>;
                } else {
                    codePromise = result || '';
                }
            }

            // 2. Children
            const handleChildren = (paramCode: string) => {
                let childrenCodeResult: string | Promise<string>;
                if (directive.children) {
                    const rawChildrenCode = processChildren(ejb, children);

                    if (directive.onChildren) {
                         const applyOnChildren = (resolvedChildrenCode: string) => {
                            const result = directive.onChildren!(ejb, { ...context, children: resolvedChildrenCode });
                            if (isPromise(result) && !ejb.async) {
                                throw new Error(`[EJB] Directive '@${name}' is async (onChildren) and cannot be used in sync mode.`);
                            }
                            return result || '';
                         }
                         childrenCodeResult = isPromise(rawChildrenCode) ? rawChildrenCode.then(applyOnChildren) : applyOnChildren(rawChildrenCode);
                    } else {
                        childrenCodeResult = rawChildrenCode;
                    }
                } else {
                    childrenCodeResult = '';
                }
                
                return isPromise(childrenCodeResult)
                    ? childrenCodeResult.then(cc => paramCode + cc)
                    : paramCode + childrenCodeResult;
            };

            codePromise = isPromise(codePromise)
                ? codePromise.then(handleChildren)
                : handleChildren(codePromise);
            
            // 3. onEnd
            const handleEnd = (currentCode: string) => {
                let endResult: string | Promise<string> = '';
                 if (directive.onEnd) {
                    const result = directive.onEnd(ejb, context);
                    if (isPromise(result) && !ejb.async) {
                        throw new Error(`[EJB] Directive '@${name}' is async (onEnd) and cannot be used in sync mode.`);
                    }
                    endResult = result || '';
                }
                return isPromise(endResult) ? endResult.then(ec => currentCode + ec) : currentCode + endResult;
            };

            return isPromise(codePromise) ? codePromise.then(handleEnd) : handleEnd(codePromise);
        }
        default:
            return '';
    }
}

export function compile<Async extends boolean>(
    ejb: Ejb<Async>, 
    ast: RootNode
): IfAsync<Async, string> {
    const bodyCode = generateNodeCode(ejb, ast);

    const constructFinalCode = (code: string) => {
        return `${code}\nreturn $ejb;`;
    };

    if (isPromise(bodyCode)) {
        // This check is technically redundant if generateNodeCode works correctly, but it's a good safeguard.
        if (!ejb.async) {
            throw new Error('[EJB] Compilation resulted in a promise in sync mode.');
        }
        return bodyCode.then(constructFinalCode) as IfAsync<Async, string>;
    } else {
        return constructFinalCode(bodyCode) as IfAsync<Async, string>;
    }
}
