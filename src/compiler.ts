import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type { RootNode, AstNode, TextNode, InterpolationNode, DirectiveNode, CssBlockNode, IfAsync } from "./types";
import { escapeJs, isPromise } from "./utils";

function processNode(
  ejb: Ejb<boolean>, 
  node: AstNode,
  stringMode: boolean
): string | Promise<string> {
  const generator = stringMode ? generateNodeString : generateNodeCode;
  return generator(ejb, node);
}

function processChildren(
  ejb: Ejb<boolean>, 
  children: AstNode[],
  stringMode: boolean = false
): string | Promise<string> {
  if (!children.length) return '';
  
  const results = children.map(child => processNode(ejb, child, stringMode));
  const promises = results.filter(isPromise);

  if (promises.length > 0) {
    if (!ejb.async) {
      throw new Error('[EJB] Async operation in sync mode during child processing');
    }
    return Promise.all(results).then(resolved => resolved.join(''));
  }
  
  return (results as string[]).join('');
}

export function generateNodeString(ejb: Ejb<boolean>, node: AstNode): string | Promise<string> {
  switch (node.type) {
    case EjbAst.Root:
      return processChildren(ejb, node.children, true);

    case EjbAst.Text:
      return escapeJs((node as TextNode).value);
    
    case EjbAst.CssBlock:
      return escapeJs((node as CssBlockNode).content);
    
    default:
      return '';
  }
}

export function generateNodeCode(ejb: Ejb<boolean>, node: AstNode): string | Promise<string> {
  switch (node.type) {
    case EjbAst.Root:
      return processChildren(ejb, node.children);

    case EjbAst.Text:
      return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n`;

    case EjbAst.CssBlock:
      return `$ejb.res += \`${escapeJs((node as CssBlockNode).content)}\`;\n`;

    case EjbAst.Interpolation: {
      const { expression, escaped } = node as InterpolationNode;
      const value = escaped ? `$ejb.escapeHtml(${expression})` : expression;
      return `$ejb.res += ${value};\n`;
    }
    
    case EjbAst.Directive:
      return handleDirective(ejb, node, false);
    
    default:
      return '';
  }
}

function handleDirective(
  ejb: Ejb<boolean>,
  node: DirectiveNode,
  stringMode: boolean
): string | Promise<string> {
  const { name, expression, children } = node;
  const directive = ejb.directives[name];

  if (!directive) {
    throw new Error(`[EJB] Directive not found: @${name}`);
  }

  // Processa onParams se existir
  const processParams = () => {
    if (!directive.onParams) return '';
    const result = directive.onParams(ejb, expression);
    if (isPromise(result) && !ejb.async) {
      throw new Error(`[EJB] Directive '@${name}' is async (onParams) in sync mode`);
    }
    return result || '';
  };

  // Processa children conforme definido pela diretiva
  const processDirectiveChildren = (paramsResult: string) => {
    if (!directive.children) return paramsResult;

    if (directive.onChildren) {
      const result = directive.onChildren(ejb, { children });
      if (isPromise(result) && !ejb.async) {
        throw new Error(`[EJB] Directive '@${name}' is async (onChildren) in sync mode`);
      }
      return isPromise(result)
        ? result.then(childrenResult => paramsResult + childrenResult)
        : paramsResult + result;
    }

    const childrenResult = processChildren(ejb, children, stringMode);
    return isPromise(childrenResult)
      ? childrenResult.then(cr => paramsResult + cr)
      : paramsResult + childrenResult;
  };

  // Processa onEnd se existir
  const processEnd = (currentCode: string) => {
    if (!directive.onEnd) return currentCode;
    
    const result = directive.onEnd(ejb);
    if (isPromise(result) && !ejb.async) {
      throw new Error(`[EJB] Directive '@${name}' is async (onEnd) in sync mode`);
    }
    return isPromise(result)
      ? result.then(endResult => currentCode + endResult)
      : currentCode + result;
  };

  // Encadeia todo o processamento
  const paramsResult = processParams();
  if (isPromise(paramsResult)) {
    return (paramsResult as Promise<string>)
      .then(processDirectiveChildren)
      .then(processEnd);
  }

  const childrenResult = processDirectiveChildren(paramsResult);
  return isPromise(childrenResult)
    ? childrenResult.then(processEnd)
    : processEnd(childrenResult);
}

export function compile<Async extends boolean>(
  ejb: Ejb<Async>,
  ast: RootNode
): IfAsync<Async, string> {
  const bodyCode = generateNodeCode(ejb, ast);
  const endFns: Function[] = [];
  const initCodes: (string | Promise<string>)[] = [];

  // Processa inicializações e finalizações das diretivas
  Object.values(ejb.directives).forEach(directive => {
    if (directive.onEndFile) endFns.push(directive.onEndFile);
    if (directive.onInitFile) {
      const initCode = directive.onInitFile(ejb);
      if (initCode) initCodes.push(initCode);
    }
  });

  const constructFinalCode = (mainCode: string) => {
    const initCode = initCodes
      .filter(Boolean)
      .map(code => typeof code === 'string' ? code : '')
      .join('\n');

    const endCode = endFns.length > 0
      ? `\n${endFns.map(fn => fn(ejb)).join('\n')}`
      : '';

    return `${initCode}\n${mainCode}${endCode}\nreturn $ejb;`;
  };

  if (isPromise(bodyCode) || initCodes.some(isPromise)) {
    if (!ejb.async) {
      throw new Error('[EJB] Async compilation in sync mode');
    }
    
    return (async () => {
      const [resolvedBody, ...resolvedInits] = await Promise.all([
        bodyCode,
        ...initCodes.filter(isPromise)
      ]);

      let initIdx = 0;
      const resolvedInitCode = initCodes
        .map(code => isPromise(code) ? resolvedInits[initIdx++] : code)
        .join('\n');

      return constructFinalCode(`${resolvedInitCode}\n${resolvedBody}`);
    })() as IfAsync<Async, string>;
  }

  return constructFinalCode(bodyCode as string) as IfAsync<Async, string>;
}