import { Parser } from './parser';
import { Compiler, RESPONSE_SYMBOL, STRUCTURE_SYMBOL } from './compiler';
import type { DirectiveDefinition, KirePlugin, KireContext, KireElementHandler, KireSchematic, KireOptions, IParserConstructor, ICompilerConstructor, KireElementOptions, KireHooks } from './types';
import { join } from './utils/path';
import { KireDirectives } from './directives';

export class Kire {
  public directives: Map<string, DirectiveDefinition> = new Map();
  public elements: Map<string, { handler: KireElementHandler, options?: KireElementOptions }> = new Map();
  public globalContext: Map<string, any> = new Map();
  public hooks: KireHooks = {};
  
  public root: string;
  public cache: boolean;
  public resolverFn: (filename: string) => Promise<string>;
  public alias: Record<string, string>;
  public extension: string;
  public cacheFiles: Map<string, Function> = new Map();
  public parserConstructor: IParserConstructor;
  public compilerConstructor: ICompilerConstructor;

  constructor(options: KireOptions = {}) {
    this.root = options.root ?? './';
    this.cache = options.cache ?? true;
    this.alias = options.alias ?? { '~/': this.root };
    this.extension = options.extension ?? 'kire';
    
    this.resolverFn = options.resolver ?? (async (filename) => {
         throw new Error(`No resolver defined for path: ${filename}`);
    });

    this.parserConstructor = options.engine?.parser ?? Parser;
    this.compilerConstructor = options.engine?.compiler ?? Compiler;
    
    // Collect plugins to load
    const pluginsToLoad: Array<{p: KirePlugin<any>, o?: any}> = [];

    // Register default directives
    if(typeof options.directives == "undefined"  || options.directives == true) {
        pluginsToLoad.push({ p: KireDirectives });
    }

    // User provided plugins
    if (options.plugins) {
        for (const p of options.plugins) {
            if (Array.isArray(p)) {
                pluginsToLoad.push({ p: p[0], o: p[1] });
            } else {
                pluginsToLoad.push({ p });
            }
        }
    }

    // Sort plugins (default sort 100)
    pluginsToLoad.sort((a, b) => (a.p.sort ?? 100) - (b.p.sort ?? 100));

    // Load plugins
    for (const item of pluginsToLoad) {
        this.plugin(item.p, item.o);
    }
  }

  public plugin<KirePlugged extends KirePlugin<any>>(plugin: KirePlugged, opts?: KirePlugged['options']) {
    if (typeof plugin === 'function') {
        // Support functional plugins if any legacy ones exist, though interface says otherwise
        (plugin as any)(this, opts);
    } else if (plugin.load) {
        plugin.load(this, opts);
    }
    return this;
  }

  public pkgSchema(name: string, repository?: string | { type: string; url: string }, version?: string): KireSchematic {
    const globals: Record<string, any> = {};
    this.globalContext.forEach((value, key) => {
        globals[key] = value;
    });

    return {
        package:name,
        repository,
        version,
        directives: Array.from(this.directives.values()),
        globals: globals
    };
  }

  public element(name: string, handler: KireElementHandler, options?: KireElementOptions) {
      this.elements.set(name, { handler, options });
      return this;
  }

  public directive(def: DirectiveDefinition) {
    this.directives.set(def.name, def);
    if (def.parents) {
        for (const parent of def.parents) {
            this.directive(parent);
        }
    }
    return this;
  }

  public getDirective(name: string) {
    return this.directives.get(name);
  }

  public $ctx(key: string, value: any) {
    this.globalContext.set(key, value);
    return this;
  }

  public parse(template: string) {
    const parser = new this.parserConstructor(template, this);
    return parser.parse();
  }

  public async compile(template: string): Promise<string> {
    const parser = new this.parserConstructor(template, this);
    const nodes = parser.parse();
    const compiler = new this.compilerConstructor(this);
    return compiler.compile(nodes);
  }
  
  public resolvePath(filepath: string, currentFile?: string): string {
    if (!filepath) return filepath;

    // If it's a URL, return it directly
    if (filepath.startsWith('http://') || filepath.startsWith('https://')) {
        return filepath;
    }

    // Normalize
    let resolved = filepath.replace(/\\/g, "/").replace(/(?<!:)\/+/g, "/");
    const root = this.root.replace(/\\/g, "/").replace(/\/$/, "");

    // Check absolute
    const isWindowsAbsolute = /^[a-zA-Z]:\//.test(resolved);

    // Aliases
    const aliases = Object.entries(this.alias);
    // Sort aliases by length desc
    aliases.sort((a, b) => b[0].length - a[0].length);

    let matchedAlias = false;
    for (const [alias, replacement] of aliases) {
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`^${escapedAlias}`).test(filepath)) {
            resolved = join(replacement, filepath.slice(alias.length));
            matchedAlias = true;
            break;
        }
    }

    if (matchedAlias) {
        // if alias matched, it might still need normalization or extension
    } else {
        const isResolvedAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(resolved);
        if (!isResolvedAbsolute && !isWindowsAbsolute) {
            const base = currentFile
                ? currentFile.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
                : root;
            resolved = join(base, resolved);
        }
    }

    // Add extension if needed, but not to URLs
    if (this.extension && !/\.[^/.]+$/.test(resolved) && !(resolved.startsWith('http://') || resolved.startsWith('https://'))) {
        const ext = this.extension.charAt(0) === "." ? this.extension : `.${this.extension}`;
        resolved += ext;
    }

    return resolved.replace(/\/+/g, "/");
  }

  // Helper to compile and create a function
  public async createFunction(template: string, filename?: string): Promise<Function> {
      let content = template;
      let usedFilename = filename;

      // Check if template is a path (heuristic)
      const isTemplatePath = (str: string) => {
          // If it has newlines or template syntax, it's definitely content
          if (str.includes('\n') || str.includes('{{') || str.includes('@')) return false;
          
          // If it looks like a path or simple filename
          return str.includes('/') || str.includes('\\') || str.endsWith(`.${this.extension}`) || /^[a-zA-Z0-9_-]+$/.test(str);
      };

      if (isTemplatePath(template)) {
          const resolvedPath = this.resolvePath(template);
          if (this.cache && this.cacheFiles.has(resolvedPath)) {
              return this.cacheFiles.get(resolvedPath) as Function;
          }
          try {
            content = await this.resolverFn(resolvedPath);
            usedFilename = resolvedPath;
          } catch (e: any) {
             // If resolver fails, assume it's a literal string
             if (!e.message.includes('No resolver')) {
                 throw e;
             }
          }
      }

      const code = await this.compile(content);
      try {
          const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
          const fn = new AsyncFunction('$ctx', code);
          
          if (usedFilename && this.cache) {
              this.cacheFiles.set(usedFilename, fn);
          }
          return fn;
      } catch (e) {
          console.error("Error creating function from code:", code);
          throw e;
      }
  }

  public async render(template: string, locals: Record<string, any> = {}): Promise<string> {
      const fn = await this.createFunction(template);
      
      // Runtime context merging globals and locals
      const rctx: any = {};
      for (const [k, v] of this.globalContext) {
          rctx[k] = v;
      }
      Object.assign(rctx, locals);
      
      // Initialize the response and structure symbols on the runtime context
      rctx[RESPONSE_SYMBOL] = '';
      rctx[STRUCTURE_SYMBOL] = [];
      
      // Runtime helper to append to response
      rctx.res = (str: any) => {
          rctx[RESPONSE_SYMBOL] += str;
      };

      // Helper to resolve paths inside directives
      rctx.resolve = (path: string) => {
          return this.resolvePath(path); 
      };
      
      // Helper to load templates at runtime (for @include)
      rctx.load = async (path: string) => {
          return this.createFunction(path);
      };

      // Method to create a new context based on current one (for isolation)
      rctx.clone = (locals: Record<string, any> = {}): KireContext => {
          const newCtx = Object.create(rctx); // Inherit prototype
          Object.assign(newCtx, locals); // Assign locals
          // Initialize for new context
          newCtx[RESPONSE_SYMBOL] = '';
          newCtx[STRUCTURE_SYMBOL] = [];
          return newCtx;
      };

      // Method to clear response/structure for current context
      rctx.clear = (): void => {
          rctx[RESPONSE_SYMBOL] = '';
          rctx[STRUCTURE_SYMBOL] = [];
      };

      // Helper to add to context (used by imports logic)
      rctx.add = async (childFn: Function) => {
         if (typeof childFn === 'function') {
             // Use clone to create child context, locals are usually passed in @include
             // If childFn (e.g. from createFunction) needs locals, it's passed during its execution.
             // Here, childCtx is for its OWN response and structure.
             const childCtx = rctx.clone();
             
             // Execute the child function with the child context
             const resultCtx = await childFn(childCtx);
             
             // Add the result context to the parent's structure
             rctx[STRUCTURE_SYMBOL].push(resultCtx);
             
             // Append the child's response to the parent's response
             rctx[RESPONSE_SYMBOL] += resultCtx[RESPONSE_SYMBOL];
         } else {
             rctx[RESPONSE_SYMBOL] += childFn;
         }
      };

      // Execute the compiled function
      if (this.hooks.onAfterDirectives) {
          if (Array.isArray(this.hooks.onAfterDirectives)) {
              for (const hook of this.hooks.onAfterDirectives) {
                  await hook(rctx);
              }
          } else {
              await this.hooks.onAfterDirectives(rctx);
          }
      }
      
      const finalCtx = await fn(rctx);
      
      // Post-process elements
      let resultHtml = finalCtx[RESPONSE_SYMBOL];
      
      // Hook: onBewareElements
      if (this.hooks.onBewareElements) {
          if (Array.isArray(this.hooks.onBewareElements)) {
              for (const hook of this.hooks.onBewareElements) {
                  const res = await hook(rctx, resultHtml);
                  if (typeof res === 'string') resultHtml = res;
              }
          } else {
              const res = await this.hooks.onBewareElements(rctx, resultHtml);
              if (typeof res === 'string') resultHtml = res;
          }
      }
      
      if (this.elements.size > 0) {
          for (const [tagName, { handler, options }] of this.elements) {
              // Check if void tag
              const isVoid = options?.void || /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName);
              
              const regex = isVoid 
                  ? new RegExp(`<${tagName}([^>]*)>`, 'gi')
                  : new RegExp(`<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
              
              const matches = [];
              let match;
              while ((match = regex.exec(resultHtml)) !== null) {
                  matches.push({
                      full: match[0],
                      attrs: match[1],
                      inner: isVoid ? '' : match[2],
                      index: match.index
                  });
              }
              
              for (const m of matches) {
                  if (!resultHtml.includes(m.full)) {
                      continue;
                  }

                  const attributes: Record<string, string> = {};
                  const attrRegex = /(\w+)="([^"]*)"/g;
                  let attrMatch;
                  while ((attrMatch = attrRegex.exec(m.attrs!)) !== null) {
                      attributes[attrMatch[1]!] = attrMatch[2]!;
                  }

                  const elCtx: any = rctx.clone();
                  elCtx.content = resultHtml; 
                  elCtx.element = {
                      tagName,
                      attributes,
                      inner: m.inner,
                      outer: m.full
                  };
                  elCtx.update = (newContent: string) => {
                      resultHtml = newContent;
                      elCtx.content = newContent;
                  };
                  elCtx.replace = (replacement: string) => {
                      resultHtml = resultHtml.replace(m.full, replacement);
                      elCtx.content = resultHtml;
                  };
                  elCtx.replaceContent = (replacement: string) => {
                      if (!isVoid) {
                           const newOuter = m.full.replace(m.inner!, replacement);
                           resultHtml = resultHtml.replace(m.full, newOuter);
                           elCtx.content = resultHtml;
                      }
                  };
                  
                  await handler(elCtx);
                  
                  if (elCtx.content !== resultHtml) {
                      resultHtml = elCtx.content;
                  }
              }
          }
      }
      
      // Hook: onAfterElements
      if (this.hooks.onAfterElements) {
          if (Array.isArray(this.hooks.onAfterElements)) {
              for (const hook of this.hooks.onAfterElements) {
                  const res = await hook(rctx, resultHtml);
                  if (typeof res === 'string') resultHtml = res;
              }
          } else {
              const res = await this.hooks.onAfterElements(rctx, resultHtml);
              if (typeof res === 'string') resultHtml = res;
          }
      }
      
      return resultHtml;
  }
}
