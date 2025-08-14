import type { Ejb } from "./ejb";
import type { RootNode, DirectiveNode, CssBlockNode } from "./types";
import { EJB_DEFAULT_PREFIX_VARIABLE, EjbAst } from "./constants";

const DIRECTIVE_REGEX = /^\s*([a-zA-Z0-9]+)(?:\s*\(([\s\S]*?)\))?/;

// Contextos onde CSS deve ser tratado literalmente
const CSS_CONTEXTS = new Set(['css', 'style']);

export function ejbParser<A extends boolean>(ejb: Ejb<A>, template: string): RootNode {
    const root: RootNode = { type: EjbAst.Root, children: [] };
    const stack: (RootNode | DirectiveNode)[] = [root];
    let cursor = 0;

    const [interpStart, interpEnd] = (ejb.prefix.variable || EJB_DEFAULT_PREFIX_VARIABLE).split('*');
    const directivePrefix = ejb.prefix.directive;

    // Função para verificar se estamos em contexto CSS
    const isInCssContext = (): boolean => {
        for (let i = stack.length - 1; i >= 0; i--) {
            const node = stack[i];
            if (node.type === EjbAst.Directive && 'name' in node) {
                return CSS_CONTEXTS.has((node as DirectiveNode).name);
            }
        }
        return false;
    };

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
            // Se estamos em contexto CSS, trata como texto literal
            if (isInCssContext()) {
                const brace_end = template.indexOf(interpEnd!, cursor);
                if (brace_end === -1) {
                    // Se não encontrar o fechamento, trata como texto normal
                    parent!.children.push({ 
                        type: EjbAst.Text, 
                        value: remaining_text.charAt(0) 
                    });
                    cursor += 1;
                } else {
                    // Inclui as chaves como parte do CSS
                    const css_content = template.substring(cursor, brace_end + interpEnd!.length);
                    parent!.children.push({ 
                        type: EjbAst.CssBlock, 
                        content: css_content 
                    });
                    cursor = brace_end + interpEnd!.length;
                }
            } else {
                // Contexto normal - trata como interpolação JavaScript
                cursor += interpStart!.length;
                const expression_end = template.indexOf(interpEnd!, cursor);
                if (expression_end === -1) throw new Error("Unclosed interpolation expression");
                const expression = template.substring(cursor, expression_end).trim();
                parent!.children.push({ type: EjbAst.Interpolation, expression, escaped: true });
                cursor = expression_end + interpEnd!.length;
            }
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