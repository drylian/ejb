import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type { RootNode, AstNode, TextNode, InterpolationNode, DirectiveNode, IfAsync, SubDirectiveNode } from "./types";
import { escapeJs, isPromise, PromiseResolver } from "./utils";

function processNode(
  ejb: Ejb<boolean>, 
  node: AstNode,
  stringMode: boolean
): string | Promise<string> {
  return stringMode ? generateNodeString(ejb, node) : generateNodeCode(ejb, node);
}

function processChildren(
  ejb: Ejb<boolean>, 
  children: AstNode[],
  stringMode: boolean = false
): string | Promise<string> {
  if (!children.length) return '';
  
  const results = children.map(child => processNode(ejb, child, stringMode));
  if (results.some(isPromise)) {
    if (!ejb.async) throw new Error('[EJB] Async operation in sync mode');
    return Promise.all(results).then(resolved => resolved.join(''));
  }
  
  return (results as string[]).join('');
}

export function generateNodeString(ejb: Ejb<boolean>, node: AstNode): string | Promise<string> {
  switch (node.type) {
    case EjbAst.Root: return processChildren(ejb, node.children, true);
    case EjbAst.Text: return escapeJs((node as TextNode).value);
    default: return '';
  }
}

export function generateNodeCode(ejb: Ejb<boolean>, node: AstNode): string | Promise<string> {
  switch (node.type) {
    case EjbAst.Root: return processChildren(ejb, node.children);
    case EjbAst.Text: return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n`;
    case EjbAst.Interpolation: {
      const { expression, escaped } = node as InterpolationNode;
      const value = escaped ? `$ejb.escapeHtml(${expression})` : expression;
      return `$ejb.res += ${value};\n`;
    }
    case EjbAst.Directive: return handleDirective(ejb, node, false);
    case EjbAst.SubDirective: return handleDirective(ejb, node, false);
    default: return '';
  }
}

function handleDirective(
  ejb: Ejb<boolean>,
  node: DirectiveNode | SubDirectiveNode,
  stringMode: boolean
): string | Promise<string> {
  const { name, expression, children } = node;
  
  // Get the appropriate directive definition
  let directive;
  if (node.type === EjbAst.SubDirective) {
    const parentDirective = ejb.directives[(node as SubDirectiveNode).parentName];
    directive = parentDirective?.parents?.find(p => p.name === name);
  } else {
    directive = ejb.directives[name];
  }
  
  if (!directive) throw new Error(`[EJB] Directive not found: @${name}`);

  const buildProcessor = (handler: Function, ...args: any[]) => {
    return (prev: string) => {
      const result = handler(...args);
      if (isPromise(result) && !ejb.async) {
        throw new Error(`[EJB] Async operation in sync mode for @${name}`);
      }
      return PromiseResolver(result, (res: string) => prev + (res || ''));
    };
  };

  const processors: Array<(input: string) => string | Promise<string>> = [];
  
  // Handle directive initialization
  if (directive.onInit) processors.push(buildProcessor(directive.onInit, ejb));
  
  // Handle parameters processing
  if (directive.onParams) processors.push(buildProcessor(directive.onParams, ejb, expression));
  
  // Handle children processing
  processors.push((prev) => {
    //@ts-expect-error ignore
    if (!directive.children && !(directive.internal && children.length)) return prev;
    
    if (directive.onChildren) {
      return buildProcessor(directive.onChildren, ejb, { children })(prev);
    }
    
    return PromiseResolver(
      processChildren(ejb, children, stringMode),
      (res) => prev + res
    );
  });

  // Handle directive finalization
  if (directive.onEnd) processors.push(buildProcessor(directive.onEnd, ejb));

  let result: string | Promise<string> = '';
  for (const processor of processors) {
    result = PromiseResolver(result, processor);
  }

  return result;
}

export function compile<Async extends boolean>(
  ejb: Ejb<Async>,
  ast: RootNode
): IfAsync<Async, string> {
  const bodyCode = generateNodeCode(ejb, ast);
  const endFns = Object.values(ejb.directives)
    .filter(d => d.onEndFile)
    .map(d => d.onEndFile);

  const initCodes = Object.values(ejb.directives)
    .filter(d => d.onInitFile)
    .map(d => d?.onInitFile?.(ejb))
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

    let initIdx = 0;
    const init = initCodes
      .map(code => isPromise(code) ? resolvedInits[initIdx++] : code)
      .join('\n');

    return buildFinalCode(init, resolvedBody);
  })() as IfAsync<Async, string>;
}