import { EjbAst } from "./constants";
import { createExpression } from "./expression";
import type {
	AstNode,
	DirectiveNode,
	InterpolationNode,
	RootNode,
	SubDirectiveNode,
	TextNode,
} from "./types";
import type { Ejb } from "./ejb";
import { escapeJs } from "./utils";

async function processChildren(
	ejb: Ejb,
	children: AstNode[],
	parents: AstNode[] = [],
): Promise<void> {
	if (!children.length) return;
	for (const child of children) {
		await processNode(ejb, child, parents);
	}
}

async function processNode(
	ejb: Ejb,
	node: AstNode,
	parents: AstNode[] = [],
): Promise<void> {
	switch (node.type) {
		case EjbAst.Root:
			await processChildren(ejb, (node as RootNode).children, parents);
			break;
		case EjbAst.Text:
			// In build mode, text is added directly to the current loader
			if(['client','server'].includes(ejb.builder.loader)) {
				ejb.builder.add(`$ejb.res += \`${escapeJs((node as TextNode).value)}\``);
			} else {
				ejb.builder.add((node as TextNode).value);
			}
			break;
		case EjbAst.Interpolation: {
			// In build mode, interpolation is converted to the target language's syntax
			// For JS, this means adding `${expression}` to a template literal.
			// This is a simplification; the final output might need more complex handling.
			const { expression, escaped } = node as InterpolationNode;
			ejb.builder.add(`\${${escaped ? `this.escapeHtml(${expression})` : expression}}`);
			break;
		}
		case EjbAst.Directive:
		case EjbAst.SubDirective:
			await handleDirective(ejb, node, parents);
			break;
		default:
			break;
	}
}

async function handleDirective(
	ejb: Ejb,
	node: DirectiveNode | SubDirectiveNode,
	parents: AstNode[],
): Promise<void> {
	const { name, expression, children = [], loc } = node;
	const isSubDirective = node.type === EjbAst.SubDirective;

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
		ejb.errors.push(Object.assign(error, { loc }));
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
		if (directive.onInitBuild) await Promise.resolve(directive.onInitBuild(ejb, exp, loc));
		if (directive.onParamsBuild) await Promise.resolve(directive.onParamsBuild(ejb, exp, loc));

		const [regularChildren, subDirectives] = [
			children.filter((child) => child.type !== EjbAst.SubDirective),
			children.filter((child) => child.type === EjbAst.SubDirective),
		];

		if (regularChildren.length) {
			if(directive.onChildrenBuild) {
				await Promise.resolve(directive.onChildrenBuild(ejb, { children: regularChildren, parents: newParents }));
			} else {
				await processChildren(ejb, regularChildren, newParents as AstNode[]);
			}
		}

		if (subDirectives.length) {
			for(const sub of subDirectives) {
				await processNode(ejb, sub, newParents as AstNode[]);
			}
		}

		if (directive.onEndBuild) await Promise.resolve(directive.onEndBuild(ejb));
	} catch (error: any) {
		const ejbError = error instanceof Error ? error : new Error(String(error));
		ejb.errors.push(Object.assign(ejbError, { loc }));
	}
}

export async function compileForBuild(ejb: Ejb, ast: RootNode): Promise<void> {
	const fileDirectives = Object.values(ejb.directives).filter(
		(d) => d.onInitFileBuild || d.onEndFileBuild,
	);

	for (const d of fileDirectives) {
		if (d.onInitFileBuild) await Promise.resolve(d.onInitFileBuild(ejb));
	}

	await processNode(ejb, ast);

	for (const d of fileDirectives) {
		if (d.onEndFileBuild) await Promise.resolve(d.onEndFileBuild(ejb));
	}
}
