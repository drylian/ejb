// Use snake_case for constants, keep comments in English
import {
	DIRECTIVE_REGEX,
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_VARIABLE,
	EjbAst,
} from "./constants";
import type { Ejb } from "./ejb";
import type { DirectiveNode, RootNode, SubDirectiveNode } from "./types";

export function ejbParser<A extends boolean>(
	ejb: Ejb<A>,
	template: string,
): RootNode {
	const root: RootNode = { type: EjbAst.Root, children: [] };
	const stack: (RootNode | DirectiveNode | SubDirectiveNode)[] = [root];
	let cursor = 0;

	const [interp_start, interp_end] = EJB_DEFAULT_PREFIX_VARIABLE.split(
		"*",
	) as string[];
	const directive_prefix = EJB_DEFAULT_PREFIX_DIRECTIVE;

	while (cursor < template.length) {
		const parent = stack[stack.length - 1];
		if (!parent) break;

		const remaining = template.substring(cursor);
		const next_directive = remaining.indexOf(directive_prefix);
		const next_interpolation = remaining.indexOf(interp_start);

		// Find next token
		const next_token_pos = Math.min(
			next_directive !== -1 ? next_directive : Infinity,
			next_interpolation !== -1 ? next_interpolation : Infinity,
		);

		// Process text before token
		if (next_token_pos !== Infinity && next_token_pos > 0) {
			parent.children.push({
				type: EjbAst.Text,
				value: remaining.substring(0, next_token_pos),
			});
			cursor += next_token_pos;
			continue;
		}

		if (next_token_pos === Infinity) {
			// No token found, process remaining text
			if (remaining.length > 0) {
				parent.children.push({ type: EjbAst.Text, value: remaining });
			}
			break;
		}

		// Process token
		if (next_token_pos === next_interpolation) {
			cursor += interp_start.length;
			const expression_end = template.indexOf(interp_end, cursor);
			if (expression_end === -1)
				throw new Error("Unclosed interpolation expression");

			parent.children.push({
				type: EjbAst.Interpolation,
				expression: template.substring(cursor, expression_end).trim(),
				escaped: true,
			});
			cursor = expression_end + interp_end.length;
			continue;
		}

		if (next_token_pos === next_directive) {
			cursor += directive_prefix.length;
			const directive_match = template.substring(cursor).match(DIRECTIVE_REGEX);
			if (!directive_match) throw new Error("Invalid directive");

			const [matched_str, name, expr_raw = ""] = directive_match;
			const expr = expr_raw.trim();
			cursor += matched_str.length;

			// CRITICAL CHECK: Before processing closing, verify if it's a valid subdirective
			let parent_directive: DirectiveNode | SubDirectiveNode | null = null;
			let is_sub_directive = false;

			// First check if it's a subdirective of any parent in the stack
			for (let i = stack.length - 1; i >= 0; i--) {
				const node = stack[i];
				if (
					node.type === EjbAst.Directive ||
					node.type === EjbAst.SubDirective
				) {
					const directive_def = ejb.directives[node.name];
					if (directive_def?.parents?.some((p: any) => p.name === name)) {
						parent_directive = node;
						is_sub_directive = true;
						break;
					}
				}
			}

			// Only process as closing if it's NOT a valid subdirective
			const is_closing_directive =
				!is_sub_directive &&
				(name === "end" ||
					stack.some(
						(node) =>
							node.type !== EjbAst.Root &&
							(node as DirectiveNode | SubDirectiveNode).name === name,
					));

			if (is_closing_directive) {
				if (stack.length === 1) {
					throw new Error(`Unexpected ${directive_prefix}${name} directive`);
				}

				if (name === "end") {
					stack.pop();
					continue;
				}

				// Find and close matching directive
				const target_index = stack.findLastIndex(
					(node, index) =>
						index > 0 && // Ignore root
						node.type !== EjbAst.Root &&
						(node as DirectiveNode | SubDirectiveNode).name === name,
				);

				if (target_index === -1) {
					throw new Error(
						`No matching ${directive_prefix}${name} directive to close`,
					);
				}

				stack.length = target_index;
				continue;
			}

			// If we got here, it's an opening directive or subdirective
			// If we didn't find parent_directive earlier, search again to define directive_def
			if (!is_sub_directive) {
				for (let i = stack.length - 1; i >= 0; i--) {
					const node = stack[i];
					if (
						node.type === EjbAst.Directive ||
						node.type === EjbAst.SubDirective
					) {
						const directive_def = ejb.directives[node.name];
						if (directive_def?.parents?.some((p: any) => p.name === name)) {
							parent_directive = node;
							is_sub_directive = true;
							break;
						}
					}
				}
			}

			const directive_def = is_sub_directive
				? ejb.directives[parent_directive?.name as string]?.parents?.find(
						(p: any) => p.name === name,
					)
				: ejb.directives[name];

			if (!directive_def) {
				throw new Error(`[EJB] Directive not found: ${directive_prefix}${name}`);
			}

			// Create directive node
			const directive_node: DirectiveNode | SubDirectiveNode = is_sub_directive
				? {
						type: EjbAst.SubDirective,
						name,
						expression: expr,
						children: [],
						auto_closed: false,
						parent_name: parent_directive?.name as string,
					}
				: {
						type: EjbAst.Directive,
						name,
						expression: expr,
						children: [],
						auto_closed: false,
					};

			// Auto-close siblings of same type (only for subdirectives)
			if (is_sub_directive && parent_directive) {
				const parent_children = parent_directive.children;

				// Find all siblings of same type that are still open
				const open_siblings = parent_children.filter(
					(child): child is SubDirectiveNode =>
						child.type === EjbAst.SubDirective &&
						child.name === name &&
						child.parent_name === parent_directive?.name &&
						!child.auto_closed,
				);

				// Close all open siblings (except current one being created)
				for (const sibling of open_siblings) {
					sibling.auto_closed = true;

					// Remove from stack if it's at the top
					const sibling_index = stack.indexOf(sibling);
					if (sibling_index !== -1 && sibling_index === stack.length - 1) {
						stack.pop();
					}
				}

				// Add subdirective to parent directive
				parent_directive.children.push(directive_node);
			} else {
				// For normal directives, add to current parent
				parent.children.push(directive_node);
			}

			// Push to stack if directive can have children
			const should_push_to_stack =
				is_sub_directive ||
				"children" in directive_def ||
				"internal" in directive_def;
			if (should_push_to_stack) {
				stack.push(directive_node);
			}
		}
	}

	// Close remaining directives
	while (stack.length > 1) {
		const node = stack.pop() as DirectiveNode | SubDirectiveNode;
		node.auto_closed = true;
	}

	return root;
}