import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type { RootNode, AstNode, TextNode, InterpolationNode, DirectiveNode, IfAsync, SubDirectiveNode } from "./types";
import { escapeJs, isPromise, PromiseResolver } from "./utils";

function processNode<A extends boolean>(
  ejb: Ejb<A>, 
  node: AstNode,
  stringMode: boolean
): IfAsync<A, string> {
  return stringMode ? generateNodeString(ejb, node) : generateNodeCode(ejb, node);
}

function processChildren<A extends boolean>(
  ejb: Ejb<A>, 
  children: AstNode[],
  stringMode: boolean = false
): IfAsync<A, string> {
  if (!children.length) return (ejb.async ? Promise.resolve('') : '') as IfAsync<A, string>;
  
  // Process children in batches for better performance
  const batchSize = 10;
  const results: (string | Promise<string>)[] = [];
  
  for (let i = 0; i < children.length; i += batchSize) {
    const batch = children.slice(i, i + batchSize);
    const batchResults = batch.map(child => processNode(ejb, child, stringMode));
    results.push(...batchResults);
  }

  const hasPromises = results.some(isPromise);
  
  if (hasPromises) {
    if (!ejb.async) throw new Error('[EJB] Async operation in sync mode');
    return Promise.all(results).then(resolved => resolved.join('')) as IfAsync<A, string>;
  }
  
  return (results as string[]).join('') as IfAsync<A, string>;
}

export function generateNodeString<A extends boolean>(
  ejb: Ejb<A>, 
  node: AstNode
): IfAsync<A, string> {
  switch (node.type) {
    case EjbAst.Root: 
      return processChildren(ejb, node.children, true);
    case EjbAst.Text: 
      return escapeJs((node as TextNode).value) as IfAsync<A, string>;
    case EjbAst.Interpolation: {
      const { expression } = node as InterpolationNode;
      return expression as IfAsync<A, string>;
    }
    default: 
      return (ejb.async ? Promise.resolve('') : '') as IfAsync<A, string>;
  }
}

export function generateNodeCode<A extends boolean>(
  ejb: Ejb<A>,
  node: AstNode
): IfAsync<A, string> {
  switch (node.type) {
    case EjbAst.Root: 
      return processChildren(ejb, node.children);
    case EjbAst.Text: 
      return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n` as IfAsync<A, string>;
    case EjbAst.Interpolation: {
      const { expression, escaped } = node as InterpolationNode;
      const value = escaped ? `$ejb.escapeHtml(${expression})` : expression;
      return `$ejb.res += ${value};\n` as IfAsync<A, string>;
    }
    case EjbAst.Directive:
    case EjbAst.SubDirective: 
      return handleDirective(ejb, node, false);
    default: 
      return (ejb.async ? Promise.resolve('') : '') as IfAsync<A, string>;
  }
}

function handleDirective<A extends boolean>(
  ejb: Ejb<A>,
  node: DirectiveNode | SubDirectiveNode,
  stringMode: boolean
): IfAsync<A, string> {
  const { name, expression, children = [] } = node;
  
  // Try to get cached processors first
  const cacheKey = node as object;
  let processors = [] as ((input: string) => any)[];
  
  if (!processors) {
    // Get the appropriate directive definition
    let directive;
    let isSubDirective = node.type === EjbAst.SubDirective;
    
    if (isSubDirective) {
      const parentDirectiveName = (node as SubDirectiveNode).parentName;
      const parentDirective = ejb.directives[parentDirectiveName];
      directive = parentDirective?.parents?.find(p => p.name === name);
      
      if (!directive) {
        const error = `[EJB] Sub-directive "${name}" not found in parent "${parentDirectiveName}"`;
        return (ejb.async ? Promise.reject(new Error(error)) : error) as IfAsync<A, string>;
      }
    } else {
      directive = ejb.directives[name];
      if (!directive) {
        const error = `[EJB] Directive not found: @${name}`;
        return (ejb.async ? Promise.reject(new Error(error)) : error) as IfAsync<A, string>;
      }
    }

    const buildProcessor = (handler: Function, ...args: any[]) => {
      return (prev: string) => {
        try {
          const result = handler(...args);
          if (isPromise(result) && !ejb.async) {
            throw new Error(`[EJB] Async operation in sync mode for @${name}`);
          }
          return PromiseResolver(result, (res: string) => prev + (res || ''));
        } catch (error) {
          return ejb.async ? Promise.reject(error) : error as IfAsync<A, string>;
        }
      };
    };

    // Separate regular children from sub-directives
    const regularChildren = children.filter(child => child.type !== EjbAst.SubDirective);
    const subDirectives = children.filter(child => child.type === EjbAst.SubDirective);

    processors = [];
    
    // 1. Directive initialization
    if (directive.onInit) {
      processors.push(buildProcessor(directive.onInit, ejb));
    }
    
    // 2. Parameters processing
    if (directive.onParams) {
      processors.push(buildProcessor(directive.onParams, ejb, expression));
    }
    
    // 3. Process sub-directives
    if (subDirectives.length > 0) {
      processors.push((prev: string) => {
        const processSubDirective = (subDirective: SubDirectiveNode): IfAsync<A, string> => {
          const processed = generateNodeCode(ejb, subDirective);
          return processed;
        };

        if (subDirectives.some(sd => isPromise(generateNodeCode(ejb, sd)))) {
          if (!ejb.async) {
            return `[EJB] Async sub-directive in sync mode: @${name}` as IfAsync<A, string>;
          }
          return Promise.all(subDirectives.map(processSubDirective))
            .then(results => prev + results.join('')) as IfAsync<A, string>;
        }
        
        return prev + subDirectives.map(processSubDirective).join('') as IfAsync<A, string>;
      });
    }
    
    // 4. Process regular children
    //@ts-expect-error not typed
    if (directive.children || (directive.internal && regularChildren.length > 0)) {
      processors.push((prev) => {
        if (directive.onChildren) {
          return buildProcessor(directive.onChildren, ejb, { children: regularChildren })(prev);
        }
        
        const childrenResult = processChildren(ejb, regularChildren, stringMode);
        
        if (isPromise(childrenResult)) {
          if (!ejb.async) {
            return `[EJB] Async children in sync mode for @${name}` as IfAsync<A, string>;
          }
          return childrenResult.then(res => prev + res) as IfAsync<A, string>;
        }
        
        return (prev + childrenResult) as IfAsync<A, string>;
      });
    }

    // 5. Directive finalization
    if (directive.onEnd) {
      processors.push(buildProcessor(directive.onEnd, ejb));
    }
  }

  // Execute processors sequentially
  const executeProcessors = (index: number, currentResult: string): IfAsync<A, string> => {
    if (index >= processors!.length) return currentResult as IfAsync<A, string>;
    
    const processed = processors![index](currentResult);
    
    if (isPromise(processed)) {
      if (!ejb.async) {
        return `[EJB] Async processor in sync mode for @${name}` as IfAsync<A, string>;
      }
      return processed.then(res => executeProcessors(index + 1, res as string)) as IfAsync<A, string>;
    }
    
    return executeProcessors(index + 1, processed) as IfAsync<A, string>;
  };
  
  return executeProcessors(0, '');
}

export function compile<Async extends boolean>(
  ejb: Ejb<Async>,
  ast: RootNode
): IfAsync<Async, string> {
  // Pre-filter directives with file-level handlers
  const directivesWithHandlers = Object.values(ejb.directives).filter(d => d.onInitFile || d.onEndFile);
  
  const bodyCode = generateNodeCode(ejb, ast);
  const endFns = directivesWithHandlers
    .filter(d => d.onEndFile)
    .map(d => d.onEndFile);

  const initCodes = directivesWithHandlers
    .filter(d => d.onInitFile)
    .map(d => d.onInitFile?.(ejb))
    .filter(Boolean);

  const buildFinalCode = (init: string, body: string) => 
    `${init}\n${body}${endFns.length ? `\n${endFns.map(fn => fn?.(ejb)).join('\n')}` : ''}\nreturn $ejb;`;

  if (!isPromise(bodyCode) && !initCodes.some(isPromise)) {
    return buildFinalCode(initCodes.join('\n'), bodyCode as string) as IfAsync<Async, string>;
  }

  if (!ejb.async) throw new Error('[EJB] Async compilation in sync mode');

  return (async () => {
    const [resolvedBody, ...resolvedInits] = await Promise.all([
      bodyCode,
      ...initCodes.filter(isPromise)
    ]);

    const init = initCodes
      .map(code => isPromise(code) ? resolvedInits.shift() : code)
      .join('\n');

    return buildFinalCode(init, resolvedBody);
  })() as IfAsync<Async, string>;
}