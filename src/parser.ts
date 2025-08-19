import {
	DIRECTIVE_REGEX,
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_VARIABLE,
	EjbAst,
} from "./constants";
import type { Ejb } from "./ejb";
import type { DirectiveNode, RootNode, SubDirectiveNode } from "./types";

/**
 * Parses EJB template string into an Abstract Syntax Tree (AST)
 * @template A - Boolean indicating if the Ejb instance is in async mode
 * @param ejb - The Ejb instance containing configuration and directives
 * @param template - The template string to parse
 * @returns RootNode representing the parsed AST
 * @throws {Error} When encountering unclosed interpolation expressions or invalid directives
 */
export function ejbParser<A extends boolean>(
	ejb: Ejb<A>,
	template: string,
): RootNode {
	// Initialize root node and parsing stack
	const root: RootNode = { type: EjbAst.Root, children: [] };
	const stack: (RootNode | DirectiveNode | SubDirectiveNode)[] = [root];
	let cursor = 0;

	// Get interpolation and directive prefixes from configuration
	const [interpStart, interpEnd] = (EJB_DEFAULT_PREFIX_VARIABLE).split("*") as string[];
	const directivePrefix = EJB_DEFAULT_PREFIX_DIRECTIVE;

	// Main parsing loop
	while (cursor < template.length) {
		const parent = stack[stack.length - 1];
		if (!parent) break;

		const text_before_token = template.substring(cursor);

		// Find next directive or interpolation start
		const directive_start = text_before_token.indexOf(directivePrefix);
		const expression_start = text_before_token.indexOf(interpStart);

		// Determine where the next token starts
		let text_end = -1;
		if (directive_start !== -1 && expression_start !== -1) {
			text_end = Math.min(directive_start, expression_start);
		} else if (directive_start !== -1) {
			text_end = directive_start;
		} else if (expression_start !== -1) {
			text_end = expression_start;
		}

		// Process text content before the next token
		if (text_end !== 0) {
			const text_content =
				text_end === -1
					? text_before_token
					: text_before_token.substring(0, text_end);
			if (text_content) {
				parent.children.push({ type: EjbAst.Text, value: text_content });
			}
			cursor += text_content.length;
			if (text_end === -1) break;
		}

		const remaining_text = template.substring(cursor);

		// Handle interpolation expressions
		if (remaining_text.startsWith(interpStart)) {
			cursor += interpStart.length;
			const expression_end = template.indexOf(interpEnd, cursor);
			if (expression_end === -1)
				throw new Error("Unclosed interpolation expression");
			const expression = template.substring(cursor, expression_end).trim();
			parent.children.push({
				type: EjbAst.Interpolation,
				expression,
				escaped: true,
			});
			cursor = expression_end + interpEnd?.length;
		}
		// Handle directives
		else if (remaining_text.startsWith(directivePrefix)) {
			cursor += directivePrefix.length;
			const directive_match = template.substring(cursor).match(DIRECTIVE_REGEX);
			if (!directive_match) throw new Error("Invalid directive");

			const [matched_str, name, expr = ""] = directive_match;
			cursor += matched_str.length;

			// Handle directive end markers
			if (name === "end") {
				if (stack.length === 1)
					throw new Error(`Unexpected ${directivePrefix}end directive`);
				stack.pop();
			}
			// Handle regular directives and sub-directives
			else {
				let isSubDirective = false;
				let parentDirectiveName = "";
				let parentDirectiveDef = null;

				// Search through stack to find parent directive
				for (let i = stack.length - 1; i >= 0; i--) {
					const potentialParent = stack[i];
					if (
						potentialParent.type === EjbAst.Directive ||
						potentialParent.type === EjbAst.SubDirective
					) {
						parentDirectiveDef = ejb.directives[potentialParent.name];
						if (parentDirectiveDef?.parents?.some((p) => p.name === name)) {
							isSubDirective = true;
							parentDirectiveName = potentialParent.name;
							break;
						}
					}
				}

				// Get the appropriate directive definition
				const directiveDef = isSubDirective
					? parentDirectiveDef?.parents?.find((p) => p.name === name)
					: ejb.directives[name];

				if (!directiveDef) {
					throw new Error(
						`[EJB] Directive not found: ${directivePrefix}${name}`,
					);
				}

				// Create appropriate node type
				const directiveNode = isSubDirective
					? ({
							type: EjbAst.SubDirective,
							name,
							expression: expr.trim(),
							children: [],
							autoClosed: false,
							parentName: parentDirectiveName,
						} as SubDirectiveNode)
					: ({
							type: EjbAst.Directive,
							name,
							expression: expr.trim(),
							children: [],
							autoClosed: false,
						} as DirectiveNode);

				parent.children.push(directiveNode);

				// Push to stack if it's a subdirective or accepts children
				//@ts-expect-error not typed
				if (isSubDirective || directiveDef.children || directiveDef.internal) {
					stack.push(directiveNode);
				}
			}
		}
	}

	// Close any remaining open directives
	while (stack.length > 1) {
		const node = stack.pop();
		if (
			node &&
			(node.type === EjbAst.Directive || node.type === EjbAst.SubDirective)
		) {
			node.autoClosed = true;
		}
	}

	return root;
}
