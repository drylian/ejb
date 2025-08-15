import { EJB_HEAD_DIRECTIVE_REPLACER, ejbDirective } from "./constants";
import { ejbParser } from './parser';
import { escapeJs, filepathResolver, isPromise, PromiseResolver, returnEjbRes } from './utils';

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
     * Component directive
     */
    ejbDirective({
        name: 'import',
        priority: 10,
        children: false,
        // onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
        // onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
        onInit: (ejb) => `$ejb.res += ${ejb.async ? 'await' : ''} (${ejb.async ? 'async' : ''} ($ejb) => {`,
        onEnd: () => "})({ ...$ejb, res:'' });",
        onParams: (ejb, exp) => {
            const expIdx = exp.indexOf(',');
            const path = (expIdx === -1 ? exp : exp.slice(0, expIdx)).trim().replace(/['"`]/g, '');
            const params = (expIdx === -1 ? '{}' : exp.slice(expIdx + 1)).trim();

            if (!ejb.resolver) {
                throw new Error(`[EJB] @import directive requires a resolver to be configured.`);
            }

            try {
                const resolved = ejb.resolver(filepathResolver(ejb, path));

                if (!ejb.async && isPromise(resolved)) {
                    throw new Error(`[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`);
                }

                return PromiseResolver(resolved, (content: string) => {
                    const ast = ejbParser(ejb, content);
                    const code = ejb.compileNode(ast);

                    if (!ejb.async && isPromise(code)) {
                        throw new Error(`[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`);
                    }

                    return PromiseResolver(code, (code: string) => {
                        return [
                            "const $_import = { ...$ejb, res: '' };",
                            `const $_variables = { ...${ejb.prefix.global}, ...(${params}) };`,
                            `return new $ejb.EjbFunction('$ejb', $ejb.ins.prefix.global, \`${escapeJs(code)}\\nreturn $ejb.res;\`)($_import, $_variables)`
                        ].join('\n');
                    });
                });
            } catch (e: any) {
                console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
                return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
            }
        }
    }),
    ejbDirective({
        name: 'component',
        priority: 10,
        children: false,
        parents: [{
            name: 'slot',
            internal:true,
            onParams: (ejb, exp) => {
                return `const $${exp} = ${ejb.async ? 'await' : ''} (${ejb.async ? 'async' : ''} ($ejb) => {`
            },
        }],
        // onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
        // onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
        onInit: (ejb) => `$ejb.res += ${ejb.async ? 'await' : ''} (${ejb.async ? 'async' : ''} ($ejb) => {`,
        onEnd: () => "})({ ...$ejb, res:'' });",
        onChildren: (ejb, { children }) => {
            return PromiseResolver(ejb.compileNode(children), (content: string) => {
                return `const $slot = ${returnEjbRes(ejb, content)} ?? ""`;
            })
        },
        onParams: (ejb, exp) => {
            const expIdx = exp.indexOf(',');
            const path = (expIdx === -1 ? exp : exp.slice(0, expIdx)).trim().replace(/['"`]/g, '');
            const params = (expIdx === -1 ? '{}' : exp.slice(expIdx + 1)).trim();

            if (!ejb.resolver) {
                throw new Error(`[EJB] @import directive requires a resolver to be configured.`);
            }

            try {
                const resolved = ejb.resolver(filepathResolver(ejb, path));

                if (!ejb.async && isPromise(resolved)) {
                    throw new Error(`[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`);
                }

                return PromiseResolver(resolved, (content: string) => {
                    const ast = ejbParser(ejb, content);
                    const code = ejb.compileNode(ast);

                    if (!ejb.async && isPromise(code)) {
                        throw new Error(`[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`);
                    }

                    return PromiseResolver(code, (code: string) => {
                        return [
                            "const $_import = { ...$ejb, res: '' };",
                            `const $_variables = { ...${ejb.prefix.global}, ...(${params}) };`,
                            `return new $ejb.EjbFunction('$ejb', $ejb.ins.prefix.global, \`${escapeJs(code)}\\nreturn $ejb.res;\`)($_import, $_variables)`
                        ].join('\n');
                    });
                });
            } catch (e: any) {
                console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
                return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
            }
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
            const promise = ejb.compileNode(opts.children);
            const processing = isPromise(promise)
                ? promise.then(i => returnEjbRes(ejb, i))
                : returnEjbRes(ejb, promise)
            return `$ejb.css.add(
                ${processing}
            );`
        },
        onEndFile: () => `$ejb.head.add(\`<style>\${$ejb.css.values().toArray().join("\\n")}</style>\`)`,
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