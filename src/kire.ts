import { Parser } from './parser';
import { Compiler, RESPONSE_SYMBOL, STRUCTURE_SYMBOL } from './compiler';
import type { DirectiveDefinition, KirePlugin, KireContext, KireElementHandler } from './types';
import { join } from './utils/path';
import { KireDirectives } from './directives';

export interface KireOptions {
    root?: string;
    cache?: boolean;
    resolver?: (filename: string) => Promise<string>;
    alias?: Record<string, string>;
    extension?: string;
}

export class Kire {
  private directives: Map<string, DirectiveDefinition> = new Map();
  private elements: Map<string, KireElementHandler> = new Map();
  private globalContext: Map<string, any> = new Map();
  
  public root: string;
  public cache: boolean;
  public resolverFn: (filename: string) => Promise<string>;
  public alias: Record<string, string>;
  public extension: string;
  public cacheFiles: Map<string, Function> = new Map();

  constructor(options: KireOptions = {}) {
    this.root = options.root ?? './';
    this.cache = options.cache ?? true;
    this.alias = options.alias ?? { '~/': this.root };
    this.extension = options.extension ?? 'kire';
    
    this.resolverFn = options.resolver ?? (async (filename) => {
         throw new Error(`No resolver defined for path: ${filename}`);
    });
    
    // Register default directives
    this.plugin(KireDirectives);
  }

  public plugin(plugin: KirePlugin, opts?: any) {
    if (typeof plugin === 'function') {
        // Support functional plugins if any legacy ones exist, though interface says otherwise
        (plugin as any)(this, opts);
    } else if (plugin.load) {
        plugin.load(this, opts);
    } else if ((plugin as any).install) {
        // Legacy support
        (plugin as any).install(this, opts);
    }
    return this;
  }

  public element(name: string, handler: KireElementHandler) {
      this.elements.set(name, handler);
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

  public async compile(template: string): Promise<string> {
    const parser = new Parser(template, this);
    const nodes = parser.parse();
    
    const compiler = new Compiler(this);
    return compiler.compile(nodes);
  }
  
  public resolvePath(filepath: string, currentFile?: string): string {
    if (!filepath) return filepath;

    // Normalize
    let resolved = filepath.replace(/\\/g, "/").replace(/\/+/g, "/");
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

    // Add extension if needed
    if (this.extension && !/\.[^/.]+$/.test(resolved)) {
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
      const runtimeCtx: any = {};
      for (const [k, v] of this.globalContext) {
          runtimeCtx[k] = v;
      }
      Object.assign(runtimeCtx, locals);
      
      // Initialize the response and structure symbols on the runtime context
      runtimeCtx[RESPONSE_SYMBOL] = '';
      runtimeCtx[STRUCTURE_SYMBOL] = [];
      
      // Runtime helper to append to response
      runtimeCtx.res = (str: any) => {
          runtimeCtx[RESPONSE_SYMBOL] += str;
      };

      // Helper to resolve paths inside directives
      runtimeCtx.resolve = (path: string) => {
          return this.resolvePath(path); 
      };
      
      // Helper to load templates at runtime (for @include)
      runtimeCtx.load = async (path: string) => {
          return this.createFunction(path);
      };

      // Method to create a new context based on current one (for isolation)
      runtimeCtx.clone = (locals: Record<string, any> = {}): KireContext => {
          const newCtx = Object.create(runtimeCtx); // Inherit prototype
          Object.assign(newCtx, locals); // Assign locals
          // Initialize for new context
          newCtx[RESPONSE_SYMBOL] = '';
          newCtx[STRUCTURE_SYMBOL] = [];
          return newCtx;
      };

      // Method to clear response/structure for current context
      runtimeCtx.clear = (): void => {
          runtimeCtx[RESPONSE_SYMBOL] = '';
          runtimeCtx[STRUCTURE_SYMBOL] = [];
      };

      // Helper to add to context (used by imports logic)
      runtimeCtx.add = async (childFn: Function) => {
         if (typeof childFn === 'function') {
             // Use clone to create child context, locals are usually passed in @include
             // If childFn (e.g. from createFunction) needs locals, it's passed during its execution.
             // Here, childCtx is for its OWN response and structure.
             const childCtx = runtimeCtx.clone();
             
             // Execute the child function with the child context
             const resultCtx = await childFn(childCtx);
             
             // Add the result context to the parent's structure
             runtimeCtx[STRUCTURE_SYMBOL].push(resultCtx);
             
             // Append the child's response to the parent's response
             runtimeCtx[RESPONSE_SYMBOL] += resultCtx[RESPONSE_SYMBOL];
         } else {
             runtimeCtx[RESPONSE_SYMBOL] += childFn;
         }
      };

      // Execute the compiled function
      const finalCtx = await fn(runtimeCtx);
      
      // Post-process elements
      let resultHtml = finalCtx[RESPONSE_SYMBOL];
      
      if (this.elements.size > 0) {
          for (const [tagName, handler] of this.elements) {
              // Check if void tag
              const isVoid = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName);
              
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
                  while ((attrMatch = attrRegex.exec(m.attrs)) !== null) {
                      attributes[attrMatch[1]] = attrMatch[2];
                  }

                  const elCtx: any = runtimeCtx.clone();
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
                  
                  await handler(elCtx);
                  
                  if (elCtx.content !== resultHtml) {
                      resultHtml = elCtx.content;
                  }
              }
          }
      }
      
      return resultHtml;
  }
}
