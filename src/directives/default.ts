import { ejbDirective } from "../constants";
import { ejbParser } from "../parser";
import {
    escapeHtml,
    escapeJs,
    escapeString,
    filepathResolver,
    isPromise,
    PromiseResolver,
    returnEjbRes,
    trimQuotes,
} from "../utils";

export const DEFAULT_DIRECTIVES = Object.assign(
    {},
    /**
     * @code
     */
    ejbDirective({
        name: "code",
        priority: 1,
        children: true,
        onChildren: (ejb, { children }) => {
            return ejb.compileNode(children, true);
        },
    }),
    /**
     * @IF Allow to if directive
     */
    ejbDirective({
        name: "if",
        priority: 1,
        children: true,
        onParams: (_, expression) => {
            return `if (${expression}) {`;
        },
        parents: [
            {
                name: "elseif",
                onParams: (_, e) => `} else if (${e}) {`,
            },
            {
                name: "else",
                onChildren: (_, ctx) =>
                    PromiseResolver(
                        _.compileNode(ctx.children),
                        (res) => `} else {\n ${res}`,
                    ),
            },
        ],
        onEnd: () => {
            return `}`;
        },
    }),
    /**
     * For directive
     */
    ejbDirective({
        name: "for",
        priority: 1,
        children: true,
        onParams: (_, expression) => {
            return `for (${expression}) {`;
        },
        onEnd: () => {
            return `}`;
        },
    }),
    /**
     * Component directive
     */
    ejbDirective({
        name: "import",
        priority: 10,
        children: false,
        // onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
        // onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
        onInit: (ejb) =>
            `$ejb.res += ${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`,
        onEnd: () => "})({ ...$ejb, res:'' });",
        onParams: (ejb, exp) => {
            const expIdx = exp.indexOf(",");
            const path = (expIdx === -1 ? exp : exp.slice(0, expIdx))
                .trim()
                .replace(/['"`]/g, "");
            const params = (expIdx === -1 ? "{}" : exp.slice(expIdx + 1)).trim();

            if (!ejb.resolver) {
                throw new Error(
                    `[EJB] @import directive requires a resolver to be configured.`,
                );
            }

            try {
                const resolved = ejb.resolver(filepathResolver(ejb, path));

                if (!ejb.async && isPromise(resolved)) {
                    throw new Error(
                        `[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`,
                    );
                }

                return PromiseResolver(resolved, (content: string) => {
                    const ast = ejbParser(ejb, content);
                    const code = ejb.compileNode(ast);

                    if (!ejb.async && isPromise(code)) {
                        throw new Error(
                            `[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`,
                        );
                    }

                    return PromiseResolver(code, (code: string) => {
                        return [
                            "const $_import = { ...$ejb, res: '' };",
                            `const $_variables = { ...${ejb.globalvar}, ...(${params}) };`,
                            `return new $ejb.EjbFunction('$ejb', $ejb.ins.globalvar, \`${escapeJs(code)}\\nreturn $ejb.res;\`)($_import, $_variables)`,
                        ].join("\n");
                    });
                });
            } catch (e: any) {
                console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
                return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
            }
        },
    }),
    ejbDirective({
        name: "component",
        priority: 10,
        children: true,
        parents: [
            {
                name: "slot",
                internal: true,
                onParams: (ejb, exp) => {
                    return `$slots["$" + ${exp}] = ${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`;
                },
                onEnd: () => "\nreturn $ejb.res;})({ ...$ejb, res:'' });",
            },
        ],
        // onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
        // onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
        onInit: (ejb) =>
            `$ejb.res += ${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => { const $slots = {};\n`,
        onEnd: () =>
            "return $_component($_import, {...$_variables, ...$slots}); })({ ...$ejb, res:'' });",
        onChildren: (ejb, { children, parents }) => {
            return PromiseResolver(ejb.compileNode(children), (content: string) => {
                return `$slots.$slot = ${returnEjbRes(ejb, content)} ?? "";\n ${parents ?? ""}\n`;
            });
        },
        onParams: (ejb, exp) => {
            const expIdx = exp.indexOf(",");
            const path = (expIdx === -1 ? exp : exp.slice(0, expIdx))
                .trim()
                .replace(/['"`]/g, "");
            const params = (expIdx === -1 ? "{}" : exp.slice(expIdx + 1)).trim();

            if (!ejb.resolver) {
                throw new Error(
                    `[EJB] @ directive requires a resolver to be configured.`,
                );
            }

            try {
                const resolved = ejb.resolver(filepathResolver(ejb, path));

                if (!ejb.async && isPromise(resolved)) {
                    throw new Error(
                        `[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`,
                    );
                }

                return PromiseResolver(resolved, (content: string) => {
                    const ast = ejbParser(ejb, content);
                    const code = ejb.compileNode(ast);

                    if (!ejb.async && isPromise(code)) {
                        throw new Error(
                            `[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`,
                        );
                    }

                    return PromiseResolver(code, (code: string) => {
                        return [
                            "const $_import = { ...$ejb, res: '' };",
                            `const $_variables = { ...${ejb.globalvar}, ...(${params}) };`,
                            `const $_component = new $ejb.EjbFunction('$ejb', $ejb.ins.globalvar, \`${escapeJs(code)}\\nreturn $ejb.res;\`);\n`,
                        ].join("\n");
                    });
                });
            } catch (e: any) {
                console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
                return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
            }
        },
    }),
    ejbDirective({
        name: "isset",
        priority: 1,
        onParams(_, expression) {
            return `if(typeof ${expression} !== "undefined" && ${expression}) $ejb.res += ${expression};`;
        },
    }),
    ejbDirective({
        name: "stack",
        onInitFile: () => `$ejb.stacks = {};`,
        onParams(_, expression) {
            return `$ejb.res += '<!-- EJB:stack(${trimQuotes(expression)}) -->';`;
        },
        onEndFile: () => {
            return `
            Object.keys($ejb.stacks).forEach(pushname => {
                $ejb.res = $ejb.res.split(\`<!-- EJB:stack(\${pushname}) -->\`).join($ejb.stacks[pushname].join('\\n'));
            });

            // remove not used stacks
            $ejb.res = $ejb.res.replace(/<!-- EJB:stack\\(.*?\\) -->/g, '');`;
        }
    }),
    /**
     * push directive
     */
    ejbDirective({
        name: "push",
        priority: 1,
        children: true,
        // onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
        // onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
        onInit: (ejb, exp) =>
            `if(!$ejb.stacks[${exp}]) $ejb.stacks[${exp}] = [];\n$ejb.stacks[${exp}].push(${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`,
        onEnd: () => ";return $ejb.res;})({ ...$ejb, res:'' }));",
        onChildren(ejb, opts) {
            const promise = ejb.compileNode(opts.children);
            return PromiseResolver(
                promise,                
            );
        },
    }),
);
