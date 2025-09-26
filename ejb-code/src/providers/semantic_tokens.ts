import * as vscode from 'vscode';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode, type SourceLocation } from 'ejb';
import { ejb_store } from '@/core/state';

const token_types = ['keyword', 'variable', 'string', 'comment', 'number', 'property', 'class', 'function'];
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
        const { loading } = ejb_store.getState();

        if (loading) {
            this.output_channel.appendLine(`[Semantic] Aborted: Directives not loaded yet.`);
            return builder.build();
        }

        try {
            const ast = ejbParser(this.ejb_instance, text);
            this.walk(ast, builder, document);
        } catch (e: any) {
            this.output_channel.appendLine(`[Semantic] Aborted: Parsing failed: ${e.message}`);
        }

        this.output_channel.appendLine(`[Semantic] Finished for ${document.uri.fsPath}.`);
        return builder.build();
    }

    private walk(node: AstNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        if (!node.loc) {
            return;
        }

        if (node.type === EjbAst.Directive || node.type === EjbAst.SubDirective) {
            this.handle_directive_node(node, builder, document);
        }

        if ('children' in node && node.children) {
            for (const child of node.children) {
                this.walk(child, builder, document);
            }
        }
    }

    private handle_directive_node(node: DirectiveNode | SubDirectiveNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        if (!node.loc) return;

        this.output_channel.appendLine(`[Semantic] Handling directive: ${node.name} at offset ${node.loc.start.offset}`);
        const start_offset = node.loc.start.offset;
        const text = document.getText();

        // Do not tokenize escaped directives (@@)
        if (text.substring(start_offset > 0 ? start_offset - 1 : 0, start_offset + 1) === '@@') {
            return;
        }

        const name_length = node.name.length + 1; // +1 for '@'
        const range = new vscode.Range(document.positionAt(start_offset), document.positionAt(start_offset + name_length));
        
        builder.push(
            range,
            'keyword',
            []
        );
        this.output_channel.appendLine(`[Semantic] Pushed keyword for ${node.name}`);
    }
}

export function register_semantic_tokens_provider(context: vscode.ExtensionContext, output_channel: vscode.OutputChannel, ejb_instance: Ejb<boolean>) {
    const provider = new EJBSemanticTokensProvider(output_channel, ejb_instance);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider({ language: 'ejb' }, provider, legend)
    );
}