import * as vscode from 'vscode';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode, type SourceLocation } from '../../src';
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
    
    markdown.appendMarkdown(`**${directive_def.sourcePackage || 'built-in'}**\n\n`);
    markdown.appendMarkdown(`${directive_def.description}\n\n`);

    if (node.auto_closed) {
        markdown.appendMarkdown(`*Esta diretiva foi fechada automaticamente.*`);
    } else {
        markdown.appendMarkdown(`*Esta diretiva é fechada por um @end correspondente.*`);
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

        const directives = Object.values(this.ejb_instance.directives) as EnrichedDirective[];
        if (!directives.length) {
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
            const word_range = new vscode.Range(
                document.positionAt(node.loc.start.offset),
                document.positionAt(node.loc.start.offset + directive_node.name.length + 1) // +1 for '@'
            );
            
            const directive_def = directives.find(d => d.name === directive_node.name);
            if (directive_def) {
                const markdown = get_directive_hover_content(directive_def, directive_node);
                return new vscode.Hover(markdown, word_range);
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

    dispose() {}
}


