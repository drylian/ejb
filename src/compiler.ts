import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import type {
	AstNode,
	DirectiveNode,
	EjbDirectiveParent,
	EjbDirectivePlugin,
	EjbError,
	IfAsync,
	InterpolationNode,
	RootNode,
	SubDirectiveNode,
	TextNode,
} from "./types";
import { createExpression } from "./expression";
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
	const { name, expression, children = [], loc } = node;

	let directive: EjbDirectivePlugin | EjbDirectiveParent | undefined;
	const isSubDirective = node.type === EjbAst.SubDirective;

	if (isSubDirective) {
		const parentDirectiveName = (node as SubDirectiveNode).parent_name;
		const parentDirective = ejb.directives[parentDirectiveName];
		directive = parentDirective?.parents?.find((p) => p.name === name);

		if (!directive) {
			const error: EjbError = new Error(
				`[EJB] Sub-directive "${name}" not found in parent "${parentDirectiveName}"`,
			);
			error.loc = loc;
			ejb.errors.push(error);
			return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;
		}
	} else {
		directive = ejb.directives[name];
		if (!directive) {
			const error: EjbError = new Error(`[EJB] Directive not found: ${name}`);
			error.loc = loc;
			ejb.errors.push(error);
			return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;
		}
	}

    const exp = createExpression(expression, directive.params || []);

	const buildResult = (handler: Function, ...args: any[]) => {
		try {
			const result = handler(...args);
			if (isPromise(result)) {
				if (!ejb.async) {
					const err: EjbError = new Error(`[EJB] Async operation in sync mode for @${name}`);
					err.loc = loc;
					ejb.errors.push(err);
					return "";
				}
				return result.catch((error: any) => {
					if (!(error instanceof Error)) {
						error = new Error(String(error));
					}
					const ejbError: EjbError = error;
					ejbError.loc = loc;
					ejb.errors.push(ejbError);
					return ""; // Continue with an empty string
				});
			}
			return result;
		} catch (error: any) {
			if (!(error instanceof Error)) {
				error = new Error(String(error));
			}
			const ejbError: EjbError = error;
					ejbError.loc = loc;
			ejb.errors.push(ejbError);
			return "";
		}
	};

	if (typeof directive.name !== "string") {
		if (directive.onNameResolver) {
			const match = (directive.name as RegExp).exec(expression);
			if (match) {
				const res = buildResult(directive.onNameResolver, ejb, match);
				if (isPromise(res)) {
					return res.then((r) => `$ejb.res += ${JSON.stringify(r || "")};`) as IfAsync<A, string>;
				}
				return `$ejb.res += ${JSON.stringify(res || "")};` as IfAsync<A, string>;
			}
		}
		return (ejb.async ? Promise.resolve("") : "") as IfAsync<A, string>;
	}

	let output = "";
	const newParents = [
		...parents,
		children.filter((i) => i.type === EjbAst.SubDirective).filter(Boolean),
	];

	// 1. onInit
	if (directive.onInit) {
		const initResult = buildResult(directive.onInit, ejb, exp, loc);
		if (isPromise(initResult)) {
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
			const paramsResult = buildResult(directive.onParams, ejb, exp, loc);
			if (isPromise(paramsResult)) {
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

	const processSubDirectives = (
		subDirectives: AstNode[],
	): IfAsync<A, string> => {
		// Process sub-directives AFTER regular children
		if (subDirectives.length > 0) {
			const subDirectivesResult = subDirectives.map((sub) =>
				generateNodeCode(ejb, sub, newParents as AstNode[]),
			);
			const hasAsyncSubs = subDirectivesResult.some(isPromise);

			if (hasAsyncSubs) {
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

	const buildFinalCode = (init: string, body: string, end: string) => {
		let exposeCode = "";
		if (ejb.globalexpose) {
			const keys = Object.keys(ejb.globals);
			if (keys.length > 0) {
				exposeCode = `const { ${keys.join(", ")} } = ${ejb.globalvar};\n`;
			}
		}
		return `${init}\n${exposeCode}${body}${end ? `\n${end}` : ""}\nreturn $ejb;`;
	};

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

	if (!ejb.async) {
		const err: EjbError = new Error("[EJB] Async compilation in sync mode");
		ejb.errors.push(err);
		return "" as IfAsync<Async, string>;
	}

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