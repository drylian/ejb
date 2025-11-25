import { EJB_VIRTUAL_FILENAME, EjbAst } from "./constants";
import type { Ejb } from "./ejb";
import { EjbBuilder } from "./builder";
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
): Promise<void> {
	if (!children.length) return;
	for (const child of children) {
		await processNode(ejb, child, stringMode, parents);
	}
}

async function processNode(
	ejb: Ejb,
	node: AstNode,
	stringMode: boolean,
	parents: AstNode[] = [],
): Promise<void> {
	stringMode
		? await generateNodeString(ejb, node, parents)
		: await generateNodeCode(ejb, node, parents);
}

export async function generateNodeString(
	ejb: Ejb,
	node: AstNode,
	parents: AstNode[] = [],
): Promise<string> {
	ejb.builder.file("temp_string");

	const logic = async () => {
		switch (node.type) {
			case EjbAst.Root:
				await processChildren(
					ejb,
					(node as RootNode).children,
					true,
					parents,
				);
				break;
			case EjbAst.Text:
				ejb.builder.add((node as TextNode).value);
				break;
			case EjbAst.Interpolation:
				ejb.builder.add(`\${${(node as InterpolationNode).expression}}`);
				break;
			case EjbAst.Directive:
			case EjbAst.SubDirective:
				{
					const { name, expression, children, loc } = node as DirectiveNode;
					const directive = ejb.directives[name]; // Simplified
					if (!directive) break;

					const exp = createExpression(expression || "", directive.params || []);

					if (directive.onInit)
						await safeExecute(ejb, directive.onInit, [ejb, exp, loc], loc);
					if (directive.onParams)
						await safeExecute(ejb, directive.onParams, [ejb, exp, loc], loc);
					if (children?.length) {
						if (directive.onChildren) {
							await safeExecute(
								ejb,
								directive.onChildren,
								[ejb, { children, parents }],
								loc,
							);
						} else {
							await processChildren(ejb, children, true, parents);
						}
					}
					if (directive.onEnd)
						await safeExecute(ejb, directive.onEnd, [ejb, exp, loc], loc);
				}
				break;
		}
	};

	await logic();
	const serverArtefact =
		ejb.files.temp_string?.find(
			(f) => f.loader === "server",
		) || { content: "" };
	delete ejb.files.temp_string;
	return serverArtefact.content;
}

export async function generateNodeCode(
	ejb: Ejb,
	node: AstNode,
	parents: AstNode[] = [],
): Promise<void> {
	switch (node.type) {
		case EjbAst.Root:
			await processChildren(ejb, node.children, false, parents);
			break;
		case EjbAst.Text:
			ejb.builder.add(`$ejb.res += \`${escapeJs((node as TextNode).value)}\`;\n`);
			break;
		case EjbAst.Interpolation: {
			const { expression, escaped } = node as InterpolationNode;
			ejb.builder.add(
				`$ejb.res += ${escaped ? `$ejb.escapeHtml(${expression})` : expression};\n`,
			);
			break;
		}
		case EjbAst.Directive:
		case EjbAst.SubDirective:
			await handleDirective(ejb, node, parents);
			break;
	}
}

async function safeExecute(
	ejb: Ejb,
	handler: Function,
	args: any[],
	loc: any,
): Promise<void> {
	try {
		await Promise.resolve(handler(...args));
	} catch (error: any) {
		const ejbError: EjbError =
			error instanceof Error ? error : new Error(String(error));
		ejbError.loc = loc;
		ejb.errors.push(ejbError);
	}
}

async function handleDirective(
	ejb: Ejb,
	node: DirectiveNode | SubDirectiveNode,
	parents: AstNode[],
): Promise<void> {
	const { name, expression, children = [], loc } = node;
	const isSubDirective = node.type === EjbAst.SubDirective;

	// Encontrar diretiva
	const directive = isSubDirective
		? ejb.directives[
			(node as SubDirectiveNode).parent_name
		]?.parents?.find((p) => p.name === name)
		: ejb.directives[name];

	if (!directive) {
		const error = new Error(
			isSubDirective
				? `[EJB] Sub-directive "${name}" not found in parent "${(node as SubDirectiveNode).parent_name}"`
				: `[EJB] Directive not found: ${name}`,
		) as EjbError;
		error.loc = loc;
		ejb.errors.push(error);
		return;
	}

	// Processar regex
	if (typeof directive.name !== "string") {
		const match =
			directive.onNameResolver && (directive.name as RegExp).exec(expression);
		if (match && directive.onNameResolver) {
			await safeExecute(
				ejb,
				directive.onNameResolver,
				[ejb, match],
				loc,
			);
		}
		return;
	}

	const exp = createExpression(expression, directive.params || []);
	const newParents = [
		...parents,
		...children.filter((i) => i.type === EjbAst.SubDirective),
	];

	// Métodos do ciclo de vida
	if (directive.onInit)
		await safeExecute(ejb, directive.onInit, [ejb, exp, loc], loc);
	if (directive.onParams) {
		await safeExecute(ejb, directive.onParams, [ejb, exp, loc], loc);
	}

	// Processar children
	const [regularChildren, subDirectives] = [
		children.filter((child) => child.type !== EjbAst.SubDirective),
		children.filter((child) => child.type === EjbAst.SubDirective),
	];

	if (regularChildren.length) {
		if (directive.onChildren) {
			await safeExecute(
				ejb,
				directive.onChildren,
				[ejb, { children: regularChildren, parents: newParents }],
				loc,
			);
		} else {
			await processChildren(
				ejb,
				regularChildren,
				false,
				newParents as AstNode[],
			);
		}
	}

	// Sub-diretivas
	if (subDirectives.length) {
		for (const sub of subDirectives) {
			await generateNodeCode(ejb, sub, newParents as AstNode[]);
		}
	}

	if (directive.onEnd) await safeExecute(ejb, directive.onEnd, [ejb], loc);
}

export async function compile(ejb: Ejb, ast: RootNode): Promise<string> {
	const builder = new EjbBuilder(ejb);
	builder.file(EJB_VIRTUAL_FILENAME);

	const fileDirectives = Object.values(ejb.directives).filter(
		(d) => d.onInitFile || d.onEndFile,
	);

	for (const d of fileDirectives.filter((d) => d.onInitFile)) {
		await Promise.resolve(d.onInitFile?.(ejb));
	}

	const exposeCode =
		ejb.globalexpose && Object.keys(ejb.globals).length
			? `const { ${Object.keys(ejb.globals).join(", ")} } = ${ejb.globalvar};\n`
			: "";

	builder.add(exposeCode);

	await generateNodeCode(ejb, ast);

	for (const d of fileDirectives.filter((d) => d.onEndFile)) {
		await Promise.resolve(d.onEndFile?.(ejb));
	}

	const serverArtefact =
		ejb.files[EJB_VIRTUAL_FILENAME]?.find((f) => f.loader === "server") || { content: "" };
	return serverArtefact.content;
}
