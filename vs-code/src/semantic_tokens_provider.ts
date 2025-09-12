import * as vscode from 'vscode';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode, type SourceLocation } from './ejb';
import { ejb_store } from './state';
import { tokenize_js } from './tokenizers/js_tokenizer';
import { tokenize_css } from './tokenizers/css_tokenizer';
import { tokenize_variables } from './tokenizers/variables_tokenizer';

const token_types = ['keyword', 'variable', 'string', 'comment', 'number', 'property', 'class', 'function', 'color', 'value', 'operator', 'punctuation'];
const token_modifiers: string[] = [];
const legend = new vscode.SemanticTokensLegend(token_types, token_modifiers);

export class EJBSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private output_channel: vscode.OutputChannel;
    private ejb_instance: Ejb<boolean>;

    constructor(output_channel: vscode.OutputChannel, ejb_instance: Ejb<boolean>) {
        this.output_channel = output_channel;
        this.ejb_instance = ejb_instance;
    }

    async provideDocumentSemanticTokens(document: vscode.TextDocument): Promise<vscode.SemanticTokens> {
        this.output_channel.appendLine(`[Semantic] Triggered for ${document.uri.fsPath}`);
        const builder = new vscode.SemanticTokensBuilder(legend);
        const text = document.getText();
        const { directives, loading } = ejb_store.getState();

        if (loading) {
            this.output_channel.appendLine(`[Semantic] Aborted: Directives not loaded yet.`);
            return builder.build();
        }

        try {
            const ast = ejbParser(this.ejb_instance, text);
            this.walk(ast, builder, document, directives);
        } catch (e: any) {
            this.output_channel.appendLine(`[Semantic] Aborted: Parsing failed: ${e.message}`);
        }

        this.output_channel.appendLine(`[Semantic] Finished for ${document.uri.fsPath}.`);
        return builder.build();
    }

    private walk(node: AstNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, directives: any[]) {
        if (!node.loc) {
            return;
        }

        if (node.type === EjbAst.Directive || node.type === EjbAst.SubDirective) {
            this.handle_directive_node(node, builder, document, directives);
        } else if (node.type === EjbAst.Text) {
            // Tokenizar variáveis em textos normais ({{ }})
            this.handle_text_node(node, builder, document);
        }

        if ('children' in node && node.children) {
            for (const child of node.children) {
                this.walk(child, builder, document, directives);
            }
        }
    }

    private handle_directive_node(node: DirectiveNode | SubDirectiveNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, directives: any[]) {
        this.output_channel.appendLine(`[Semantic] Handling directive: ${node.name} at offset ${node.loc?.start.offset}`);
        const start_offset = (node.loc as SourceLocation).start.offset;
        const text = document.getText();

        // Verificar se é uma diretiva escapada (@@)
        if (text.substring(start_offset - 1, start_offset + 1) === '@@') {
            // Não tokenizar como keyword se for escapada
            return;
        }

        const name_length = node.name.length + 1; // +1 for '@'
        builder.push(
            new vscode.Range(document.positionAt(start_offset), document.positionAt(start_offset + name_length)),
            'keyword',
            []
        );
        this.output_channel.appendLine(`[Semantic] Pushed keyword for ${node.name}`);

        if (node.expression) {
            const expression_offset = text.indexOf(node.expression, start_offset + name_length);
            if (expression_offset !== -1) {
                tokenize_js(node.expression, expression_offset, builder, document, true);
            }
        }

        const directive_def = directives.find(d => d.name === node.name);
        if (directive_def?.children_type && node.children.length > 0) {
            const first_child = node.children[0];
            const last_child = node.children[node.children.length - 1];
            if (first_child && last_child && (first_child as AstNode).loc && (last_child as AstNode).loc) {
                const content_start_offset = (first_child.loc as SourceLocation).start.offset;
                const content_end_offset = (last_child.loc as SourceLocation).end.offset;
                const content = document.getText(new vscode.Range(document.positionAt(content_start_offset), document.positionAt(content_end_offset)));
                
                this.output_channel.appendLine(`[Semantic] Processing children_type: ${directive_def.children_type}`);
                
                if (directive_def.children_type === 'js') {
                    tokenize_js(content, content_start_offset, builder, document);
                } else if (directive_def.children_type === 'css') {
                    tokenize_css(content, content_start_offset, builder, document);
                }
            }
        }
    }

    private handle_text_node(node: AstNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        if (!node.loc) return;
        
        const text_content = document.getText(new vscode.Range(
            document.positionAt(node.loc.start.offset),
            document.positionAt(node.loc.end.offset)
        ));

        // Tokenizar variáveis ({{ }}) em textos normais
        tokenize_variables(text_content, node.loc.start.offset, builder, document);
    }
}

export function register_semantic_tokens_provider(context: vscode.ExtensionContext, output_channel: vscode.OutputChannel, ejb_instance: Ejb<boolean>) {
    const provider = new EJBSemanticTokensProvider(output_channel, ejb_instance);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider({ language: 'ejb' }, provider, legend)
    );
}