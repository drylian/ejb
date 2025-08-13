import { ejbDirective } from "./constants";
import { ejbParser } from './parser';
import type { EjbDirectivePlugin } from "./types";
import { escapeJs, filepathResolver, isPromise } from './utils';

const ifDirective: EjbDirectivePlugin = {
    name: 'if',
    priority: 1,
    children: true,
    onParams: (ejb, expression) => {
        return `if (${expression}) {`;
    },
    onEnd: () => {
        return `}`;
    }
};

const forDirective: EjbDirectivePlugin = {
    name: 'for',
    priority: 1,
    children: true,
    onParams: (ejb, expression) => {
        return `for (${expression}) {`;
    },
    onEnd: () => {
        return `}`;
    }
};
const importDirective: EjbDirectivePlugin = {
    name: 'import',
    priority: 10,
    children: false,
    onParams: (ejb, expression, context) => {
        const firstCommaIndex = expression.indexOf(',');
        const pathPart = firstCommaIndex === -1 ? expression : expression.slice(0, firstCommaIndex);
        const paramsPart = firstCommaIndex === -1 ? '{}' : expression.slice(firstCommaIndex + 1);
        
        const path = pathPart.trim().replace(/['"`]/g, '');
        const paramsExpression = paramsPart.trim();

        if (!ejb.resolver) {
            throw new Error(`[EJB] @import directive requires a resolver to be configured.`);
        }
        
        try {
            const resolvedContentResult = ejb.resolver(filepathResolver(ejb, path));
            const isResolverAsync = isPromise(resolvedContentResult);

            if (!ejb.async && isResolverAsync) {
                throw new Error(`[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`);
            }

            const processContent = (templateContent: string) => {
                const subAst = ejbParser(ejb, templateContent);
                const subCodeResult = ejb.compileNode(subAst);
                const isSubCompileAsync = isPromise(subCodeResult);

                if (!ejb.async && isSubCompileAsync) {
                    throw new Error(`[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`);
                }
                
                const isOverallAsync = isResolverAsync || isSubCompileAsync;

                const generateFinalCode = (code: string) => {
                    const awaited = isOverallAsync ? "await" : "";
                    const asynced = isOverallAsync ? "async" : "";
                    const importGlobalsVar = `${ejb.prefix.global}_import`;
                    
                    const iife = `
${awaited} (${asynced} () => {
    const $ejb_import = { ...$ejb, res: '' };
    const ${importGlobalsVar} = { ...${ejb.prefix.global}, ...(${paramsExpression}) };
    const _executor = new $ejb.EjbFunction(
        '$ejb',
        $ejb.ins.prefix.global,
        \`${escapeJs(code)}\\nreturn $ejb.res;\`
    );
    return _executor($ejb_import, ${importGlobalsVar});
})()`;
                    return `$ejb.res += ${iife};`;
                };

                return isSubCompileAsync 
                    ? (subCodeResult as Promise<string>).then(generateFinalCode) 
                    : generateFinalCode(subCodeResult as string);
            };

            return isResolverAsync 
                ? (resolvedContentResult as Promise<string>).then(processContent) 
                : processContent(resolvedContentResult as string);

        } catch (e: any) {
             console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
             return `$ejb.res += \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
        }
    },
};

export const builtInDirectives = {
    ...ejbDirective(ifDirective),
    ...ejbDirective(forDirective),
    ...ejbDirective(importDirective)
};