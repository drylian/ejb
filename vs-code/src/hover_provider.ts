import * as vscode from 'vscode';
import { ejb_store } from './state';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode } from './ejb';
import type { EnrichedDirective } from './types';

function find_deepest_node_at_position(ast: AstNode, offset: number): AstNode | null {
    if (!ast.loc || offset < ast.loc.start.offset || offset > ast.loc.end.offset) {
        return null;
    }

    let deepest_node: AstNode = ast;

    // Procurar nos filhos por um nó mais específico
    if ('children' in ast && ast.children) {
        for (const child of ast.children) {
            const found_node = find_deepest_node_at_position(child, offset);
            if (found_node) {
                deepest_node = found_node;
            }
        }
    }

    return deepest_node;
}

function get_directive_hover_content(directive_def: EnrichedDirective, node: DirectiveNode | SubDirectiveNode): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();

    if (directive_def.example) {
        markdown.appendCodeblock(directive_def.example, 'ejb');
    } else {
        markdown.appendCodeblock(`@${directive_def.name}`, 'ejb');
    }

    markdown.appendMarkdown(`**${directive_def.sourcePackage || 'built-in'}**

`);
    markdown.appendMarkdown(`${directive_def.description}

`);

    if (directive_def.children) {
        if (node.auto_closed) {
            markdown.appendMarkdown(`*Esta diretiva foi fechada automaticamente.*`);
        } else {
            markdown.appendMarkdown(`*Esta diretiva é fechada por um @end correspondente.*`);
        }
    } else {
        markdown.appendMarkdown(`*Esta diretiva não requer um @end correspondente.*`);
    }

    return markdown;
}

export class EJBHoverProvider implements vscode.HoverProvider {
    private output_channel: vscode.OutputChannel;
    private ejb_instance: Ejb<boolean>;

    constructor(output_channel: vscode.OutputChannel, ejb_instance: Ejb<boolean>) {
        this.output_channel = output_channel;
        this.ejb_instance = ejb_instance;
    }

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        this.output_channel.appendLine(`[Hover] Triggered for ${document.uri.fsPath}.`);

        const directives: EnrichedDirective[] = ejb_store.getState().directives;
        if (ejb_store.getState().loading || !directives.length) {
            this.output_channel.appendLine(`[Hover] Aborted: Directives not loaded.`);
            return;
        }

        const offset = document.offsetAt(position);
        let ast: AstNode;

        try {
            ast = ejbParser(this.ejb_instance, document.getText());
        } catch (error: any) {
            this.output_channel.appendLine(`[Hover] Aborted: Parsing failed: ${error.message}`);
            return;
        }

        const node = find_deepest_node_at_position(ast, offset);

        if (!node || !node.loc) {
            this.output_channel.appendLine(`[Hover] No AST node found at offset ${offset}.`);
            return;
        }

        // Verificar se está sobre uma diretiva ou subdiretiva
        if (node.type === EjbAst.Directive || node.type === EjbAst.SubDirective) {
            const directive_node = node as DirectiveNode | SubDirectiveNode;
            
            // Verificar se o cursor está especificamente sobre o nome da diretiva
            // (não sobre os parâmetros ou dentro do conteúdo dos children)
            const directive_name_start = node.loc.start.offset;
            const directive_name_end = directive_name_start + directive_node.name.length + 1; // +1 para incluir o '@'
            
            // Só mostrar hover se o cursor estiver sobre o nome da diretiva
            if (offset >= directive_name_start && offset <= directive_name_end) {
                const word_range = new vscode.Range(
                    document.positionAt(directive_name_start),
                    document.positionAt(directive_name_end)
                );

                const directive_def = directives.find(d => d.name === directive_node.name);
                if (directive_def) {
                    const markdown = get_directive_hover_content(directive_def, directive_node);
                    return new vscode.Hover(markdown, word_range);
                }
            }
        } else if (node.type === EjbAst.Directive && (node as DirectiveNode).name === 'code') {
            const code_directive_node = node as DirectiveNode;
            const directive_def = directives.find(d => d.name === code_directive_node.name);

            if (directive_def?.children_type === 'js' && code_directive_node.children.length > 0) {
                const first_child = code_directive_node.children[0];
                const last_child = code_directive_node.children[code_directive_node.children.length - 1];

                if (first_child && last_child && first_child.loc && last_child.loc) {
                    const content_start_offset = first_child.loc.start.offset;
                    const content_end_offset = last_child.loc.end.offset;
                    const js_content = document.getText(new vscode.Range(
                        document.positionAt(content_start_offset),
                        document.positionAt(content_end_offset)
                    ));

                    const word_range = document.getWordRangeAtPosition(position);
                    if (word_range) {
                        const word = document.getText(word_range);
                        // Simple regex to find variable/function declarations
                        const definition_regex = new RegExp(`(const|let|var|function)\s+${word}\b.*`, 'g');
                        let match;
                        let definition_line = '';
                        while ((match = definition_regex.exec(js_content)) !== null) {
                            definition_line = match[0];
                            break;
                        }

                        if (definition_line) {
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(definition_line, 'javascript');
                            return new vscode.Hover(markdown, word_range);
                        }
                    }
                }
            }
        } else if (node.type === EjbAst.Directive && (node as DirectiveNode).name === 'push') {
            const push_directive_node = node as DirectiveNode;
            const directive_def = directives.find(d => d.name === push_directive_node.name);

            if (directive_def?.children_type === 'css' && push_directive_node.children.length > 0) {
                const first_child = push_directive_node.children[0];
                const last_child = push_directive_node.children[push_directive_node.children.length - 1];

                if (first_child && last_child && first_child.loc && last_child.loc) {
                    const content_start_offset = first_child.loc.start.offset;
                    const content_end_offset = last_child.loc.end.offset;
                    const css_content = document.getText(new vscode.Range(
                        document.positionAt(content_start_offset),
                        document.positionAt(content_end_offset)
                    ));

                    const word_range = document.getWordRangeAtPosition(position, /[.#]?[a-zA-Z0-9_-]+/);
                    if (word_range) {
                        const word = document.getText(word_range);
                        // Simple regex to find CSS selector definitions
                        const definition_regex = new RegExp(`(${word}\s*\{[^}]*\})`, 'g');
                        let match;
                        let definition_rule = '';
                        while ((match = definition_regex.exec(css_content)) !== null) {
                            definition_rule = match[0];
                            break;
                        }

                        if (definition_rule) {
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(definition_rule, 'css');
                            return new vscode.Hover(markdown, word_range);
                        }
                    }
                }
            }
        }

        // Verificar se está sobre a palavra @end
        const word_range = document.getWordRangeAtPosition(position, /@\w+/);
        if (word_range) {
            const word = document.getText(word_range);
            if (word === '@end') {
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`Fecha a diretiva anterior.`);
                return new vscode.Hover(markdown, word_range);
            }
        }

        return;
    }
}