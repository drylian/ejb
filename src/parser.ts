import type { Ejb } from "./ejb";
import type { RootNode, DirectiveNode } from "./types";
import { EJB_DEFAULT_PREFIX_VARIABLE, EjbAst } from "./constants";

const DIRECTIVE_REGEX = /^\s*([a-zA-Z0-9]+)(?:\s*\(([\s\S]*?)\))?/;

export function ejbParser<A extends boolean>(ejb: Ejb<A>, template: string): RootNode {
    const root: RootNode = { type: EjbAst.Root, children: [] };
    const stack: (RootNode | DirectiveNode)[] = [root];
    let cursor = 0;

    const [interpStart, interpEnd] = (ejb.prefix.variable || EJB_DEFAULT_PREFIX_VARIABLE).split('*');
    const directivePrefix = ejb.prefix.directive;

    while (cursor < template.length) {
        const parent = stack[stack.length - 1];
        const text_before_token = template.substring(cursor);

        const directive_start = text_before_token.indexOf(directivePrefix);
        const expression_start = text_before_token.indexOf(interpStart!);

        let text_end = -1;
        if (directive_start !== -1 && expression_start !== -1) {
            text_end = Math.min(directive_start, expression_start);
        } else if (directive_start !== -1) {
            text_end = directive_start;
        } else {
            text_end = expression_start;
        }

        if (text_end !== 0) {
            const text_content = text_end === -1 ? text_before_token : text_before_token.substring(0, text_end);
            if (text_content) {
                parent!.children.push({ type: EjbAst.Text, value: text_content });
            }
            cursor += text_content.length;
            if (text_end === -1) break;
        }

        const remaining_text = template.substring(cursor);

        if (remaining_text.startsWith(interpStart!)) {
            cursor += interpStart!.length;
            const expression_end = template.indexOf(interpEnd!, cursor);
            if (expression_end === -1) throw new Error("Unclosed interpolation expression");
            const expression = template.substring(cursor, expression_end).trim();
            parent!.children.push({ type: EjbAst.Interpolation, expression, escaped: true });
            cursor = expression_end + interpEnd!.length;
        } else if (remaining_text.startsWith(directivePrefix)) {
            cursor += directivePrefix.length;
            const directive_match = template.substring(cursor).match(DIRECTIVE_REGEX);
            if (!directive_match) throw new Error("Invalid directive");

            const [matched_str, name, expr = ''] = directive_match;
            cursor += matched_str.length;

            if (name === 'end') {
                if (stack.length === 1) throw new Error("Unexpected @end directive");
                stack.pop();
            } else {
                const directiveDef = ejb.directives[name!];
                if (!directiveDef) {
                     throw new Error(`[EJB] Directive not found: @${name}`);
                }

                const directiveNode: DirectiveNode = {
                    type: EjbAst.Directive,
                    name: name!,
                    expression: expr.trim(),
                    children: []
                };
                parent!.children.push(directiveNode);

                // Only push directives that expect children onto the stack
                if (directiveDef.children) {
                    stack.push(directiveNode);
                }
            }
        }
    }

    if (stack.length > 1) {
        const openDirective = stack[stack.length - 1] as DirectiveNode;
        throw new Error(`Unclosed ${directivePrefix}${openDirective.name} directive.`);
    }

    return root;
}