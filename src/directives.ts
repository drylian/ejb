import { EJB_HEAD_DIRECTIVE_REPLACER, ejbDirective } from "./constants";
import { ejbParser } from './parser';
import { escapeJs, filepathResolver, isPromise, returnEjbRes } from './utils';

export const DEFAULT_DIRECTIVES = Object.assign({},
    /**
     * @code
     */
    ejbDirective({
        name: 'code',
        priority: 1,
        children: true,
        onChildren: (ejb, { children }) => {
            return ejb.compileNode(children, true);
        }
    }),
    /**
     * @IF Allow to if directive
     */
    ejbDirective({
        name: 'if',
        priority: 1,
        children: true,
        onParams: (ejb, expression) => {
            return `if (${expression}) {`;
        },
        parents: [
            {
                name: 'elseif',
                onParams: (_, e) => `} else if (${e}) {`,
            },
            {
                name: 'else',
                onChildren: (_, ctx) => `} else {\n ${ctx.children}`,
            }
        ],
        onEnd: () => {
            return `}`;
        }
    }),
    /**
     * For directive
     */
    ejbDirective({
        name: 'for',
        priority: 1,
        children: true,
        onParams: (ejb, expression) => {
            return `for (${expression}) {`;
        },
        onEnd: () => {
            return `}`;
        }
    }),
    /**
     * css directive
     */
    ejbDirective({
        name: 'css',
        priority: 1,
        children: true,
        onInitFile: () => `$ejb.css = new Set();`,
        onChildren(ejb, opts) {
            const promise = ejb.compileNode(opts.children, true);
            const processing = isPromise(promise)
                ? promise.then(i => `\`${i}\``)
                : `\`${promise}\``
            return `$ejb.css.add(
                ${processing}
            );`
        },
        onEndFile: () => `$ejb.head.add($ejb.css.values().toArray().join("\\n"))`,
    }),
    /**
     * Import directive
     */
    ejbDirective({
        name: 'import',
        priority: 10,
        children: false,
        onParams: (ejb, exp) => {
            const commaIdx = exp.indexOf(',');
            const path = (commaIdx === -1 ? exp : exp.slice(0, commaIdx)).trim().replace(/['"`]/g, '');
            const params = (commaIdx === -1 ? '{}' : exp.slice(commaIdx + 1)).trim();

            if (!ejb.resolver) {
                throw new Error(`[EJB] @import directive requires a resolver to be configured.`);
            }

            try {
                const res = ejb.resolver(filepathResolver(ejb, path));
                const isAsyncRes = isPromise(res);

                if (!ejb.async && isAsyncRes) {
                    throw new Error(`[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`);
                }

                const process = (content: string) => {
                    const ast = ejbParser(ejb, content);
                    const codeRes = ejb.compileNode(ast);
                    const isAsyncCode = isPromise(codeRes);
                    const isTotalAsync = isAsyncRes || isAsyncCode;

                    if (!ejb.async && isAsyncCode) {
                        throw new Error(`[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`);
                    }

                    const genCode = (code: string) => {
                        const impVar = `${ejb.prefix.global}_import`;
                        return `$ejb.res += ${isTotalAsync ? 'await' : ''} (${isTotalAsync ? 'async' : ''} () => {
    const $imp = { ...$ejb, res: '' };
    const ${impVar} = { ...${ejb.prefix.global}, ...(${params}) };
    const _exec = new $ejb.EjbFunction('$ejb', $ejb.ins.prefix.global, \`${escapeJs(code)}\\nreturn $ejb.res;\`);
    return _exec($imp, ${impVar});
})();`;
                    };

                    return isAsyncCode ? (codeRes as Promise<string>).then(genCode) : genCode(codeRes as string);
                };

                return isAsyncRes ? (res as Promise<string>).then(process) : process(res as string);

            } catch (e: any) {
                console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
                return `$ejb.res += \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
            }
        },
    }),
    /**
     * head directive
     */
    ejbDirective({
        name: 'head',
        priority: 999,
        onInitFile: () => `$ejb.head = new Set();`,
        onParams(ejb, exp) {
            return `$ejb.res += '${EJB_HEAD_DIRECTIVE_REPLACER}';`
        },
        onEndFile: () => `$ejb.res = $ejb.res.replace("${EJB_HEAD_DIRECTIVE_REPLACER}", $ejb.head.values().toArray().join("\\n"))`
    }),
)