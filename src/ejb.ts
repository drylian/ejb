import { EJB_DEFAULT_PREFIX_GLOBAL, EJB_DEFAULT_PREFIX_DIRECTIVE, EJB_DEFAULT_PREFIX_VARIABLE } from "./constants";
import type { AstNode, EjbContructor, EjbDirectivePlugin, IfAsync } from "./types";
import { ejbParser } from './parser';
import { compile, generateNodeCode } from './compiler';
import { AsyncFunction, escapeHtml, escapeJs, isPromise } from './utils';
import { builtInDirectives } from "./directives";

export class Ejb<Async extends boolean = false> {
    public resolver: EjbContructor['resolver'];
    public extension: EjbContructor['extension'];
    public globals: EjbContructor['globals'];
    public prefix: EjbContructor['prefix'];
    public aliases: EjbContructor['aliases'];
    public async: Async;
    public getFunction = () => this.async ? AsyncFunction : Function;
    public directives: EjbContructor['directives'] = {};
    
    public compileNode(node:AstNode) {
        return generateNodeCode(this, node)
    }
    
    public parserAst(code:string) {
        return ejbParser(this, code);
    }

    public render(template: string, locals: Record<string, any> = {}): IfAsync<Async, string> {
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
                // This is a safeguard. The compiler should have thrown an error already.
                throw new Error('[EJB] Compilation resulted in a Promise in sync mode. Use renderAsync or configure a sync resolver/directives.');
            }
            const result = execute(codeResult as string);
            return result.res as IfAsync<Async, string>;
        }
    }

    public register(...directives: EjbDirectivePlugin[]) {
        this.directives = Object.assign(this.directives, ...directives);
        return this;
    }
    
    constructor(opts: Partial<EjbContructor> & { async?: Async } = {}) {
        this.aliases = opts.aliases ?? {};
        this.extension = opts.extension ?? 'ejb';
        this.globals = opts.globals ?? {};
        this.async = (opts.async ?? false) as Async;
        this.resolver = opts.resolver ?? ((path: string) => { 
            const content = `[EJB]: Resolver not defined, but was required for path: ${path}`;
            if (this.async) {
                return Promise.reject(new Error(content));
            }
            throw new Error(content);
        });
        
        this.directives = Object.assign({}, builtInDirectives, opts.directives);

        this.prefix = {
            global: EJB_DEFAULT_PREFIX_GLOBAL,
            directive: EJB_DEFAULT_PREFIX_DIRECTIVE,
            variable: EJB_DEFAULT_PREFIX_VARIABLE,
            ...opts.prefix,
        }
    }
}