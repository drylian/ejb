import { EJB_DEFAULT_PREFIX_GLOBAL, EJB_DEFAULT_PREFIX_DIRECTIVE, EJB_DEFAULT_PREFIX_VARIABLE, ejbDirective } from "./constants";
import type { AstNode, EjbContructor, EjbDirectivePlugin, IfAsync } from "./types";
import { ejbParser } from './parser';
import { compile, generateNodeCode, generateNodeString } from './compiler';
import { AsyncFunction, escapeHtml, escapeJs, filepathResolver, isPromise } from './utils';
import { DEFAULT_DIRECTIVES } from "./directives";

export class Ejb<Async extends boolean = false> {
    public resolver: EjbContructor<Async>['resolver'];
    public extension: EjbContructor<Async>['extension'];
    public globals: EjbContructor<Async>['globals'];
    public prefix: EjbContructor<Async>['prefix'];
    public aliases: EjbContructor<Async>['aliases'];
    public root: EjbContructor<Async>['root'];

    public async: Async;
    public getFunction = () => this.async ? AsyncFunction : Function;
    public directives: EjbContructor<Async>['directives'] = {};

    public compileNode(
        node: AstNode | AstNode[],
        stringMode = false
    ): IfAsync<Async, string> {
        const nodes = Array.isArray(node) ? node : [node];
        const generator = stringMode ? generateNodeString : generateNodeCode;

        const codes: (string | Promise<string>)[] = nodes.map(_node => generator(this, _node));

        const hasPromises = codes.some(isPromise);

        if (!hasPromises) {
            return codes.join('') as IfAsync<Async, string>;
        }
        if (!this.async) {
            throw new Error('[EJB] Async node compilation in sync mode. Enable async or use sync directives.');
        }
        return Promise.all(codes).then(resolvedCodes => resolvedCodes.join('')) as IfAsync<Async, string>;
    }

    public parserAst(code: string) {
        return ejbParser(this, code);
    }

    public render(template: string, locals: Record<string, any> = {}): IfAsync<Async, string> {
        const isPotentialPath = template.trim().split('\n').length === 1 &&
            (template.includes('/') || template.includes('\\'));

        if (isPotentialPath) {
            try {
                const resolvedPath = filepathResolver(this, template);
                const resolvedContent = this.resolver?.(resolvedPath) ?? template;

                if (isPromise(resolvedContent)) {
                    if (!this.async) {
                        throw new Error('[EJB] Async template loading in sync mode');
                    }
                    return (async () => {
                        const content = await resolvedContent;
                        return this.render(content as string, locals);
                    })() as unknown as IfAsync<Async, string>;
                }

                template = resolvedContent as string;
            } catch (e) {
                console.warn(`[EJB] Template path resolution failed, using as literal: ${template}`);
            }
        }


        const ast = ejbParser(this, template);
        const codeResult = compile(this, ast);

        const execute = (code: string) => {
            const executor = new (this.getFunction())(
                '$ejb',
                this.prefix.global,
                code
            );
            return executor({
                ins: this,
                res: '',
                escapeHtml,
                escapeJs,
                EjbFunction: this.getFunction(),
            }, { ...this.globals, ...locals });
        };

        if (this.async) {
            return (async () => {
                const code = await Promise.resolve(codeResult);
                const result = await execute(code);
                return result.res;
            })() as IfAsync<Async, string>;
        } else {
            if (isPromise(codeResult)) {
                throw new Error('[EJB] Compilation resulted in a Promise in sync mode. Use renderAsync or configure sync resolver/directives.');
            }
            const result = execute(codeResult as string);
            return result.res as IfAsync<Async, string>;
        }
    }

    public register(...directives: EjbDirectivePlugin[]) {
        const formatted = directives.map(i => Object.keys(i).length == 1 ? i : ejbDirective(i))
        this.directives = Object.assign(this.directives, ...formatted);
        return this;
    }

    constructor(opts: Partial<EjbContructor<Async>> & { async?: Async } = {}) {
        this.aliases = opts.aliases ?? {};
        this.extension = opts.extension ?? 'ejb';
        this.globals = opts.globals ?? {};
        this.async = (opts.async ?? false) as Async;
        this.root = opts.root ?? './';
        //@ts-expect-error ignore
        this.resolver = opts.resolver ?? ((path: string) => {
            const content = `[EJB]: Resolver not defined, but was required for path: ${path}`;
            if (this.async) {
                return Promise.reject(new Error(content));
            }
            throw new Error(content);
        });

        this.directives = Object.assign({}, DEFAULT_DIRECTIVES, opts.directives);

        this.prefix = {
            global: EJB_DEFAULT_PREFIX_GLOBAL,
            directive: EJB_DEFAULT_PREFIX_DIRECTIVE,
            variable: EJB_DEFAULT_PREFIX_VARIABLE,
            ...opts.prefix,
        }
    }
}