import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type {
	AstNode,
	DirectiveNode,
	EjbDirectiveParent,
	EjbDirectivePlugin,
	IfAsync,
	InterpolationNode,
	RootNode,
	SubDirectiveNode,
	TextNode,
} from "./types";
import { escapeJs, isPromise } from "./utils";

function processNode<A extends boolean>(
	ejb: Ejb<A>,
	node: AstNode,
	stringMode: boolean,
	parents: AstNode[] = [],
): IfAsync<A, string> {
	return stringMode
		? generateNodeString(ejb, node, parents)
		: generateNodeCode(ejb, node, parents);
}

function processChildren<A extends boolean>(
	ejb: Ejb<A>,
	children: AstNode[],
	stringMode: boolean = false,
	parents: AstNode[] = [],
): IfAsync<A, string> {
	if (!children.length)
		return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;

	const results: (string | Promise<string>)[] = children.map((child) =>
		processNode(ejb, child, stringMode, parents),
	);

	const hasPromises = results.some(isPromise);

	if (hasPromises) {
		if (!ejb.async) throw new Error("[EJB] Async operation in sync mode");
		return Promise.all(results).then((resolved) =>
			resolved.join(""),
		) as IfAsync<A, string>;
	}

	return (results as string[]).join("") as IfAsync<A, string>;
}

export function generateNodeString<A extends boolean>(
	ejb: Ejb<A>,
	node: AstNode,
	parents: AstNode[] = [],
): IfAsync<A, string> {
	switch (node.type) {
		case EjbAst.Root:
			return processChildren(ejb, node.children, true, parents);
		case EjbAst.Text:
			return escapeJs((node as TextNode).value) as IfAsync<A, string>;
		case EjbAst.Interpolation: {
			const { expression } = node as InterpolationNode;
			return expression as IfAsync<A, string>;
		}
		default:
			return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;
	}
}

export function generateNodeCode<A extends boolean>(
	ejb: Ejb<A>,
	node: AstNode,
	parents: AstNode[] = [],
): IfAsync<A, string> {
	switch (node.type) {
		case EjbAst.Root:
			return processChildren(ejb, node.children, false, parents);
		case EjbAst.Text:
			return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n` as IfAsync<
				A,
				string
			>;
		case EjbAst.Interpolation: {
			const { expression, escaped } = node as InterpolationNode;
			const value = escaped ? `$ejb.escapeHtml(${expression})` : expression;
			return `$ejb.res += ${value};\n` as IfAsync<A, string>;
		}
		case EjbAst.Directive:
		case EjbAst.SubDirective:
			return handleDirective(ejb, node, false, parents);
		default:
			return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;
	}
}

function handleDirective<A extends boolean>(
	ejb: Ejb<A>,
	node: DirectiveNode | SubDirectiveNode,
	stringMode: boolean,
	parents: AstNode[],
): IfAsync<A, string> {
	const { name, expression, children = [] } = node;

	let directive: EjbDirectivePlugin | EjbDirectiveParent | undefined;
	const isSubDirective = node.type === EjbAst.SubDirective;

	if (isSubDirective) {
		const parentDirectiveName = (node as SubDirectiveNode).parent_name;
		const parentDirective = ejb.directives[parentDirectiveName];
		directive = parentDirective?.parents?.find((p) => p.name === name);

		if (!directive) {
			const error = `[EJB] Sub-directive "${name}" not found in parent "${parentDirectiveName}"`;
			return (ejb.async ? Promise.reject(new Error(error)) : error) as IfAsync<
				A,
				string
			>;
		}
	} else {
		directive = ejb.directives[name];
		if (!directive) {
			const error = `[EJB] Directive not found: @${name}`;
			return (ejb.async ? Promise.reject(new Error(error)) : error) as IfAsync<
				A,
				string
			>;
		}
	}

	const buildResult = (handler: Function, ...args: any[]) => {
		try {
			const result = handler(...args);
			if (isPromise(result) && !ejb.async) {
				throw new Error(`[EJB] Async operation in sync mode for @${name}`);
			}
			return result;
		} catch (error) {
			return ejb.async ? Promise.reject(error) : (error as IfAsync<A, string>);
		}
	};

	let output = "";
	const newParents = [
		...parents,
		children.filter((i) => i.type === EjbAst.SubDirective).filter(Boolean),
	];

	// 1. onInit
	if (directive.onInit) {
		const initResult = buildResult(directive.onInit, ejb, expression);
		if (isPromise(initResult)) {
			if (!ejb.async) {
				return `[EJB] Async init in sync mode for @${name}` as IfAsync<
					A,
					string
				>;
			}
			return initResult.then((res) => {
				output += res || "";
				return processDirectiveParts();
			}) as IfAsync<A, string>;
		}
		output += initResult || "";
	}

	const processDirectiveParts = (): IfAsync<A, string> => {
		// 2. onParams
		if (directive.onParams) {
			const paramsResult = buildResult(directive.onParams, ejb, expression);
			if (isPromise(paramsResult)) {
				if (!ejb.async) {
					return `[EJB] Async params in sync mode for @${name}` as IfAsync<
						A,
						string
					>;
				}
				return paramsResult.then((res) => {
					output += res || "";
					return processChildrenAndSubDirectives();
				}) as IfAsync<A, string>;
			}
			output += paramsResult || "";
		}

		return processChildrenAndSubDirectives();
	};

	const processChildrenAndSubDirectives = (): IfAsync<A, string> => {
		const regularChildren = children.filter(
			(child) => child.type !== EjbAst.SubDirective,
		);
		const subDirectives = children.filter(
			(child) => child.type === EjbAst.SubDirective,
		);

		// Process regular children FIRST
		if (regularChildren.length > 0) {
			if (directive.onChildren) {
				const childrenResult = buildResult(directive.onChildren, ejb, {
					children: regularChildren,
					parents: newParents,
				});
				if (isPromise(childrenResult)) {
					if (!ejb.async) {
						return `[EJB] Async children handler in sync mode for @${name}` as IfAsync<
							A,
							string
						>;
					}
					return childrenResult.then((res) => {
						output += res || "";
						return processSubDirectives(subDirectives);
					}) as IfAsync<A, string>;
				}
				output += childrenResult || "";
			} else {
				const childrenResult = processChildren(
					ejb,
					regularChildren,
					stringMode,
					newParents as AstNode[],
				);
				if (isPromise(childrenResult)) {
					if (!ejb.async) {
						return `[EJB] Async children in sync mode for @${name}` as IfAsync<
							A,
							string
						>;
					}
					return childrenResult.then((res) => {
						output += res || "";
						return processSubDirectives(subDirectives);
					}) as IfAsync<A, string>;
				}
				output += childrenResult || "";
			}
		}

		return processSubDirectives(subDirectives);
	};

	const processSubDirectives = (subDirectives: AstNode[]): IfAsync<A, string> => {
		// Process sub-directives AFTER regular children
		if (subDirectives.length > 0) {
			const subDirectivesResult = subDirectives.map((sub) =>
				generateNodeCode(ejb, sub, newParents as AstNode[]),
			);
			const hasAsyncSubs = subDirectivesResult.some(isPromise);

			if (hasAsyncSubs) {
				if (!ejb.async) {
					return `[EJB] Async sub-directives in sync mode for @${name}` as IfAsync<
						A,
						string
					>;
				}
				return Promise.all(subDirectivesResult).then((results) => {
					output += results.join("");
					return processDirectiveEnd();
				}) as IfAsync<A, string>;
			}

			output += (subDirectivesResult as string[]).join("");
		}

		return processDirectiveEnd();
	};

	const processDirectiveEnd = (): IfAsync<A, string> => {
		// 5. onEnd
		if (directive.onEnd) {
			const endResult = buildResult(directive.onEnd, ejb);
			if (isPromise(endResult)) {
				if (!ejb.async) {
					return `[EJB] Async end in sync mode for @${name}` as IfAsync<
						A,
						string
					>;
				}
				return endResult.then((res) => {
					output += res || "";
					return output;
				}) as IfAsync<A, string>;
			}
			output += endResult || "";
		}

		return output as IfAsync<A, string>;
	};

	return processDirectiveParts();
}

export function compile<Async extends boolean>(
	ejb: Ejb<Async>,
	ast: RootNode,
): IfAsync<Async, string> {
	const directivesWithHandlers = Object.values(ejb.directives).filter(
		(d) => d.onInitFile || d.onEndFile,
	);

	// Process file-level initialization first
	const initCodes = directivesWithHandlers
		.filter((d) => d.onInitFile)
		.map((d) => d.onInitFile?.(ejb))
		.filter(Boolean);

	// Process body content
	const bodyCode = generateNodeCode(ejb, ast, []);

	// Process file-level finalization
	const endFns = directivesWithHandlers
		.filter((d) => d.onEndFile)
		.map((d) => d.onEndFile?.(ejb))
		.filter(Boolean);

	const buildFinalCode = (init: string, body: string, end: string) =>
		`${init}\n${body}${end ? `\n${end}` : ""}\nreturn $ejb;`;

	if (
		!isPromise(bodyCode) &&
		!initCodes.some(isPromise) &&
		!endFns.some(isPromise)
	) {
		return buildFinalCode(
			initCodes.join("\n"),
			bodyCode as string,
			endFns.join("\n"),
		) as IfAsync<Async, string>;
	}

	if (!ejb.async) throw new Error("[EJB] Async compilation in sync mode");

	return (async () => {
		const [resolvedBody, resolvedInits, resolvedEnds] = await Promise.all([
			bodyCode,
			Promise.all(initCodes.filter(isPromise)),
			Promise.all(endFns.filter(isPromise)),
		]);

		const init = initCodes
			.map((code) => (isPromise(code) ? resolvedInits.shift() : code))
			.join("\n");

		const end = endFns
			.map((fn) => (isPromise(fn) ? resolvedEnds.shift() : fn))
			.join("\n");

		return buildFinalCode(init, resolvedBody, end);
	})() as IfAsync<Async, string>;
}