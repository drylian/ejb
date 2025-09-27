import * as vscode from 'vscode';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode } from 'ejb';
import { ejbStore } from '@/core/state';

const tokenTypes = ['keyword', 'variable', 'string', 'comment', 'number', 'property', 'class', 'function'];
const tokenModifiers: string[] = [];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

export class EJBSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private outputChannel: vscode.OutputChannel;
    private ejbInstance: Ejb<boolean>;

    constructor(outputChannel: vscode.OutputChannel, ejbInstance: Ejb<boolean>) {
        this.outputChannel = outputChannel;
        this.ejbInstance = ejbInstance;
    }

    async provideDocumentSemanticTokens(document: vscode.TextDocument): Promise<vscode.SemanticTokens> {
        this.outputChannel.appendLine(`[Semantic] Triggered for ${document.uri.fsPath}`);
        const builder = new vscode.SemanticTokensBuilder(legend);
        const text = document.getText();
        const { loading } = ejbStore.getState();

        if (loading) {
            this.outputChannel.appendLine(`[Semantic] Aborted: Directives not loaded yet.`);
            return builder.build();
        }

        try {
            const ast = ejbParser(this.ejbInstance, text);
            this.walk(ast, builder, document);
        } catch (e: any) {
            this.outputChannel.appendLine(`[Semantic] Aborted: Parsing failed: ${e.message}`);
        }

        this.outputChannel.appendLine(`[Semantic] Finished for ${document.uri.fsPath}.`);
        return builder.build();
    }

    private walk(node: AstNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        if (!node.loc) {
            return;
        }

        if (node.type === EjbAst.Directive || node.type === EjbAst.SubDirective) {
            this.handleDirectiveNode(node, builder, document);
        }

        if ('children' in node && node.children) {
            for (const child of node.children) {
                this.walk(child, builder, document);
            }
        }
    }

    private handleDirectiveNode(node: DirectiveNode | SubDirectiveNode, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        if (!node.loc) return;

        this.outputChannel.appendLine(`[Semantic] Handling directive: ${node.name} at offset ${node.loc.start.offset}`);
        const startOffset = node.loc.start.offset;
        const text = document.getText();

        // Do not tokenize escaped directives (@@)
        if (text.substring(startOffset > 0 ? startOffset - 1 : 0, startOffset + 1) === '@@') {
            return;
        }

        const nameLength = node.name.length + 1; // +1 for '@'
        const range = new vscode.Range(document.positionAt(startOffset), document.positionAt(startOffset + nameLength));
        
        builder.push(
            range,
            'keyword',
            []
        );
        this.outputChannel.appendLine(`[Semantic] Pushed keyword for ${node.name}`);
    }
}

export function registerSemanticTokensProvider(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, ejbInstance: Ejb<boolean>) {
    const provider = new EJBSemanticTokensProvider(outputChannel, ejbInstance);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider({ language: 'ejb' }, provider, legend)
    );
}
