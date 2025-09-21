import type { DirectiveNode, RootNode, SubDirectiveNode, Position, SourceLocation, EjbError } from "./types";
import { DIRECTIVE_REGEX, EJB_DEFAULT_PREFIX_DIRECTIVE, EJB_DEFAULT_PREFIX_VARIABLE, EJB_ESCAPED_PREFIX_DIRECTIVE, EjbAst, } from "./constants";
import type { Ejb } from "./ejb";

function create_position(line: number, column: number, offset: number): Position {
    return { line, column, offset };
}

export function ejbParser<A extends boolean>(
	ejb: Ejb<A>,
	template: string,
): RootNode {
    let line = 1;
    let column = 1;
    let cursor = 0;

    const advance = (str: string) => {
        const lines = str.split('\n');
        if (lines.length > 1) {
            line += lines.length - 1;
            column = lines[lines.length - 1].length + 1;
        } else {
            column += str.length;
        }
        cursor += str.length;
    };

    const get_loc = (start: Position): SourceLocation => {
        return { start, end: create_position(line, column, cursor) };
    };
    
	const root: RootNode = { type: EjbAst.Root, children: [], errors: [], loc: { start: create_position(1, 1, 0), end: create_position(line, column, template.length) } };
	const stack: (RootNode | DirectiveNode | SubDirectiveNode)[] = [root];

	const [interp_start, interp_end] = EJB_DEFAULT_PREFIX_VARIABLE.split(
		"*",
	) as string[];
	const directive_prefix = EJB_DEFAULT_PREFIX_DIRECTIVE;

	const regex_directives = Object.values(ejb.directives).filter(
		(d) => typeof d.name !== "string",
	);

	while (cursor < template.length) {
		const parent = stack[stack.length - 1];
		if (!parent) break;

        const start_pos = create_position(line, column, cursor);
		const remaining = template.substring(cursor);
		const next_directive = remaining.indexOf(directive_prefix);
		const next_interpolation = remaining.indexOf(interp_start);
        const next_escaped_directive = remaining.indexOf(EJB_ESCAPED_PREFIX_DIRECTIVE);

		let earliest_regex_match: {
			index: number;
			length: number;
			directive: any;
			match: RegExpMatchArray;
		} | null = null;

		if (regex_directives.length > 0) {
			for (const directive of regex_directives) {
				const regex = directive.name as RegExp;
				const match = remaining.match(regex);
				if (
					match &&
					match.index !== undefined &&
					(earliest_regex_match === null ||
						match.index < earliest_regex_match.index)
				) {
					earliest_regex_match = {
						index: match.index,
						length: match[0].length,
						directive,
						match,
					};
				}
			}
		}

		const next_token_pos = Math.min(
			next_directive !== -1 ? next_directive : Infinity,
			next_interpolation !== -1 ? next_interpolation : Infinity,
			earliest_regex_match ? earliest_regex_match.index : Infinity,
			next_escaped_directive !== -1 ? next_escaped_directive : Infinity,
		);

		if (next_token_pos !== Infinity && next_token_pos > 0) {
            const text_content = remaining.substring(0, next_token_pos);
			parent.children.push({
				type: EjbAst.Text,
				value: text_content,
                loc: get_loc(start_pos)
			});
			advance(text_content);
			continue;
		}

		if (next_token_pos === Infinity) {
			if (remaining.length > 0) {
				parent.children.push({ type: EjbAst.Text, value: remaining, loc: get_loc(start_pos) });
                advance(remaining);
			}
			break;
		}

        const token_start_pos = create_position(line, column, cursor);

		if (next_token_pos === next_escaped_directive) {
            advance(EJB_ESCAPED_PREFIX_DIRECTIVE); // Advance past "@@"
            const escaped_directive_match = template.substring(cursor).match(DIRECTIVE_REGEX);
            if (!escaped_directive_match) {
                // If it's just @@ without a valid directive name, treat @@ as text
                parent.children.push({ type: EjbAst.Text, value: EJB_ESCAPED_PREFIX_DIRECTIVE, loc: get_loc(token_start_pos) });
                continue;
            }
            const [matched_str] = escaped_directive_match;
            parent.children.push({ type: EjbAst.Text, value: `${EJB_ESCAPED_PREFIX_DIRECTIVE}${matched_str}`, loc: get_loc(token_start_pos) });
            advance(matched_str); // Advance past the matched directive part
            continue;
        }

		if (next_token_pos === earliest_regex_match?.index) {
			const { directive, match } = earliest_regex_match;
            const expression = match[0];

			const directive_node: DirectiveNode = {
				type: EjbAst.Directive,
				name: directive.name.toString(),
				expression,
				children: [],
				auto_closed: false,
                loc: get_loc(token_start_pos)
			};

			parent.children.push(directive_node);
			advance(expression);

			if (directive.children) {
				stack.push(directive_node);
			}
			continue;
		}

		if (next_token_pos === next_interpolation) {
            advance(interp_start);
			const expression_end = template.indexOf(interp_end, cursor);
			if (expression_end === -1) {
				const err: EjbError = new Error("Unclosed interpolation expression");
				err.loc = get_loc(token_start_pos);
				root.errors.push(err);
				break;
			}

            const expression = template.substring(cursor, expression_end).trim();
			parent.children.push({
				type: EjbAst.Interpolation,
				expression,
				escaped: true,
                loc: get_loc(token_start_pos)
			});
			
            advance(template.substring(cursor, expression_end + interp_end.length));
			continue;
		}

		if (next_token_pos === next_directive) {
            advance(directive_prefix);
			const directive_match = template.substring(cursor).match(DIRECTIVE_REGEX);
			if (!directive_match) {
				const err: EjbError = new Error("Invalid directive");
				err.loc = get_loc(token_start_pos);
				root.errors.push(err);
				continue;
			};

			const [matched_str, name, expr_raw = ""] = directive_match;
			const expr = expr_raw.trim();
			
			let parent_directive: DirectiveNode | SubDirectiveNode | null = null;
			let is_sub_directive = false;

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

			const is_closing_directive =
				!is_sub_directive &&
				(
					name === "end" ||
					stack.some(
						(node) =>
							node.type !== EjbAst.Root &&
								(node as DirectiveNode | SubDirectiveNode).name === name,
					)
				);

			if (is_closing_directive) {
				if (stack.length === 1) {
					const err: EjbError = new Error(`Unexpected ${directive_prefix}${name} directive`);
					err.loc = get_loc(token_start_pos);
					root.errors.push(err);
					advance(matched_str);
					continue;
				}
                advance(matched_str);

				if (name === "end") {
                    const closed_node = stack.pop();
                    if (closed_node && closed_node.loc) {
                        closed_node.loc.end = get_loc(token_start_pos).end;
                    }
					continue;
				}

				const target_index = stack.findLastIndex(
					(node, index) =>
						index > 0 &&
						node.type !== EjbAst.Root &&
							(node as DirectiveNode | SubDirectiveNode).name === name,
				);

				if (target_index === -1) {
					const err: EjbError = new Error(
						`No matching ${directive_prefix}${name} directive to close`,
					);
					err.loc = get_loc(token_start_pos);
					root.errors.push(err);
					continue;
				}

                // Pop nodes and update their loc.end
                for (let i = stack.length - 1; i >= target_index; i--) {
                    const popped_node = stack[i];
                    if (popped_node && popped_node.loc) {
                        popped_node.loc.end = get_loc(token_start_pos).end;
                    }
                }

				stack.length = target_index;
				continue;
			}

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

			
            
            const directive_node_loc = get_loc(token_start_pos);
            (directive_node_loc.end as any) = create_position(line, column + matched_str.length, cursor + matched_str.length);


			const directive_node: DirectiveNode | SubDirectiveNode = is_sub_directive
				? {
						type: EjbAst.SubDirective,
						name,
						expression: expr,
						children: [],
						auto_closed: false,
						parent_name: parent_directive?.name as string,
                        loc: directive_node_loc
					}
				: {
						type: EjbAst.Directive,
						name,
						expression: expr,
						children: [],
						auto_closed: false,
                        loc: directive_node_loc
					};
            
            advance(matched_str);

			if (is_sub_directive && parent_directive) {
				const parent_children = parent_directive.children;
				const open_siblings = parent_children.filter(
					(child): child is SubDirectiveNode =>
						child.type === EjbAst.SubDirective &&
						child.name === name &&
						child.parent_name === parent_directive?.name &&
						!child.auto_closed,
				);

				for (const sibling of open_siblings) {
					sibling.auto_closed = true;
					const sibling_index = stack.indexOf(sibling);
					if (sibling_index !== -1 && sibling_index === stack.length - 1) {
						stack.pop();
					}
				}
				parent_directive.children.push(directive_node);
			} else {
				parent.children.push(directive_node);
			}

			let should_push_to_stack = false;
			if (directive_def) {
				should_push_to_stack =
					is_sub_directive ||
					(typeof (directive_def).children === "boolean" &&
						directive_def.children === true) ||
					"internal" in directive_def;
			}
			if (should_push_to_stack) {
				stack.push(directive_node);
			}
		}
	}

	while (stack.length > 1) {
		const node = stack.pop() as DirectiveNode | SubDirectiveNode;
		node.auto_closed = true;
        if (node.loc) {
            node.loc.end = create_position(line, column, cursor);
        }
	}
    
    root.loc!.end = create_position(line, column, cursor);

	return root;
}
