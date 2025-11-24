import { EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import { createExpression } from "./expression";
import type {
	AstNode,
	DirectiveNode,
	EjbError,
	InterpolationNode,
	RootNode,
	SubDirectiveNode,
	TextNode,
} from "./types";
import { escapeJs } from "./utils";

async function processChildren(
	ejb: Ejb,
	children: AstNode[],
	stringMode: boolean = false,
	parents: AstNode[] = [],
): Promise<string> {
	if (!children.length) return "";
	const results = await Promise.all(
		children.map((child) => processNode(ejb, child, stringMode, parents)),
	);
	return results.join("");
}

async function processNode(
	ejb: Ejb,
	node: AstNode,
	stringMode: boolean,
	parents: AstNode[] = [],
): Promise<string> {
	return stringMode
		? generateNodeString(ejb, node, parents)
		: generateNodeCode(ejb, node, parents);
}

export function generateNodeString(
	ejb: Ejb,
	node: AstNode,
	parents: AstNode[] = [],
): string {
	switch (node.type) {
		case EjbAst.Root:
			return processChildren(
				ejb,
				node.children,
				true,
				parents,
			) as unknown as string;
		case EjbAst.Text:
			return escapeJs((node as TextNode).value);
		case EjbAst.Interpolation:
			return (node as InterpolationNode).expression;
		default:
			return "";
	}
}

export async function generateNodeCode(
	ejb: Ejb,
	node: AstNode,
	parents: AstNode[] = [],
): Promise<string> {
	switch (node.type) {
		case EjbAst.Root:
			return processChildren(ejb, node.children, false, parents);
		case EjbAst.Text:
			return `$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n`;
		case EjbAst.Interpolation: {
			const { expression, escaped } = node as InterpolationNode;
			return `$ejb.res += ${escaped ? `$ejb.escapeHtml(${expression})` : expression};\n`;
		}
		case EjbAst.Directive:
		case EjbAst.SubDirective:
			return handleDirective(ejb, node, parents);
		default:
			return "";
	}
}

async function safeExecute(
	ejb: Ejb,
	handler: Function,
	args: any[],
	loc: any,
): Promise<string> {
	try {
		return (await Promise.resolve(handler(...args))) || "";
	} catch (error: any) {
		const ejbError: EjbError =
			error instanceof Error ? error : new Error(String(error));
		ejbError.loc = loc;
		ejb.errors.push(ejbError);
		return "";
	}
}

async function handleDirective(
	ejb: Ejb,
	node: DirectiveNode | SubDirectiveNode,
	parents: AstNode[],
): Promise<string> {
	const { name, expression, children = [], loc } = node;
	const isSubDirective = node.type === EjbAst.SubDirective;

	// Encontrar diretiva
	const directive = isSubDirective
		? ejb.directives[(node as SubDirectiveNode).parent_name]?.parents?.find(
				(p) => p.name === name,
			)
		: ejb.directives[name];

	if (!directive) {
		const error = new Error(
			isSubDirective
				? `[EJB] Sub-directive "${name}" not found in parent "${(node as SubDirectiveNode).parent_name}"`
				: `[EJB] Directive not found: ${name}`,
		) as EjbError;
		error.loc = loc;
		ejb.errors.push(error);
		return "";
	}

	// Processar regex
	if (typeof directive.name !== "string") {
		const match =
			directive.onNameResolver && (directive.name as RegExp).exec(expression);
		if (match && directive.onNameResolver) {
			const res = await safeExecute(
				ejb,
				directive.onNameResolver,
				[ejb, match],
				loc,
			);
			return `$ejb.res += ${JSON.stringify(res || "")};`;
		}
		return "";
	}

	const exp = createExpression(expression, directive.params || []);
	const newParents = [
		...parents,
		...children.filter((i) => i.type === EjbAst.SubDirective),
	];
	let output = "";

	// Métodos do ciclo de vida
	if (directive.onInit)
		output += await safeExecute(ejb, directive.onInit, [ejb, exp, loc], loc);
	if (directive.onParams)
		output += await safeExecute(ejb, directive.onParams, [ejb, exp, loc], loc);

	// Processar children
	const [regularChildren, subDirectives] = [
		children.filter((child) => child.type !== EjbAst.SubDirective),
		children.filter((child) => child.type === EjbAst.SubDirective),
	];

	if (regularChildren.length) {
		output += directive.onChildren
			? await safeExecute(
					ejb,
					directive.onChildren,
					[ejb, { children: regularChildren, parents: newParents }],
					loc,
				)
			: await processChildren(
					ejb,
					regularChildren,
					false,
					newParents as AstNode[],
				);
	}

	// Sub-diretivas
	if (subDirectives.length) {
		output += (
			await Promise.all(
				subDirectives.map((sub) =>
					generateNodeCode(ejb, sub, newParents as AstNode[]),
				),
			)
		).join("");
	}

	if (directive.onEnd)
		output += await safeExecute(ejb, directive.onEnd, [ejb], loc);

	return output;
}

export async function compile(ejb: Ejb, ast: RootNode): Promise<string> {
	const fileDirectives = Object.values(ejb.directives).filter(
		(d) => d.onInitFile || d.onEndFile,
	);

	const [initCodes, finalCodes] = await Promise.all([
		Promise.all(
			fileDirectives
				.filter((d) => d.onInitFile)
				.map((d) => Promise.resolve(d.onInitFile?.(ejb) || "")),
		),
		Promise.all(
			fileDirectives
				.filter((d) => d.onEndFile)
				.map((d) => Promise.resolve(d.onEndFile?.(ejb) || "")),
		),
	]);

	const exposeCode =
		ejb.globalexpose && Object.keys(ejb.globals).length
			? `const { ${Object.keys(ejb.globals).join(", ")} } = ${ejb.globalvar};\n`
			: "";

	return `${initCodes.join("\n")}\n${exposeCode}${await generateNodeCode(ejb, ast)}${finalCodes.join("\n")}\nreturn $ejb;`;
}
