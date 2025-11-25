import { EjbAst } from "./constants";
import type { EjbBuilder } from "./builder";
import { createExpression } from "./expression";
import type {
	AstNode,
	DirectiveNode,
	InterpolationNode,
	RootNode,
	SubDirectiveNode,
	TextNode,
} from "./types";
import { escapeJs } from "./utils";

async function processChildren(
	builder: EjbBuilder,
	children: AstNode[],
	parents: AstNode[] = [],
): Promise<void> {
	if (!children.length) return;
	for (const child of children) {
		await processNode(builder, child, parents);
	}
}

async function processNode(
	builder: EjbBuilder,
	node: AstNode,
	parents: AstNode[] = [],
): Promise<void> {
	switch (node.type) {
		case EjbAst.Root:
			await processChildren(builder, (node as RootNode).children, parents);
			break;
		case EjbAst.Text:
			// In build mode, text is added directly to the current loader
			builder.add((node as TextNode).value);
			break;
		case EjbAst.Interpolation: {
			// In build mode, interpolation is converted to the target language's syntax
			// For JS, this means adding `${expression}` to a template literal.
			// This is a simplification; the final output might need more complex handling.
			const { expression, escaped } = node as InterpolationNode;
			builder.add(`\${${escaped ? `this.escapeHtml(${expression})` : expression}}`);
			break;
		}
		case EjbAst.Directive:
		case EjbAst.SubDirective:
			await handleDirective(builder, node, parents);
			break;
		default:
			break;
	}
}

async function handleDirective(
	builder: EjbBuilder,
	node: DirectiveNode | SubDirectiveNode,
	parents: AstNode[],
): Promise<void> {
	const { name, expression, children = [], loc } = node;
	const isSubDirective = node.type === EjbAst.SubDirective;
	const ejb = builder.ins;

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
		);
		builder.ins.errors.push(Object.assign(error, { loc }));
		return;
	}

	if (typeof directive.name !== "string") {
		// Regex-based directives are not fully supported in build mode yet
		return;
	}

	const exp = createExpression(expression, directive.params || []);
	const newParents = [
		...parents,
		...children.filter((i) => i.type === EjbAst.SubDirective),
	];

	try {
		if (directive.onInit) await Promise.resolve(directive.onInit(builder, exp, loc));
		if (directive.onParams) await Promise.resolve(directive.onParams(builder, exp, loc));

		const [regularChildren, subDirectives] = [
			children.filter((child) => child.type !== EjbAst.SubDirective),
			children.filter((child) => child.type === EjbAst.SubDirective),
		];

		if (regularChildren.length) {
			if(directive.onChildren) {
				await Promise.resolve(directive.onChildren(builder, { children: regularChildren, parents: newParents }));
			} else {
				await processChildren(builder, regularChildren, newParents as AstNode[]);
			}
		}

		if (subDirectives.length) {
			for(const sub of subDirectives) {
				await processNode(builder, sub, newParents as AstNode[]);
			}
		}

		if (directive.onEnd) await Promise.resolve(directive.onEnd(builder));
	} catch (error: any) {
		const ejbError = error instanceof Error ? error : new Error(String(error));
		builder.ins.errors.push(Object.assign(ejbError, { loc }));
	}
}

export async function compileForBuild(builder: EjbBuilder, ast: RootNode): Promise<void> {
	const ejb = builder.ins;
	const fileDirectives = Object.values(ejb.directives).filter(
		(d) => d.onInitFile || d.onEndFile,
	);

	for (const d of fileDirectives) {
		if (d.onInitFile) await Promise.resolve(d.onInitFile(builder));
	}

	await processNode(builder, ast);

	for (const d of fileDirectives) {
		if (d.onEndFile) await Promise.resolve(d.onEndFile(builder));
	}
}
