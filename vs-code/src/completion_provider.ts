import * as vscode from 'vscode';
import { ejb_store } from './state';

export class EJBCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
        const line_prefix = document.lineAt(position).text.substring(0, position.character);
        if (!line_prefix.endsWith('@')) {
            return undefined;
        }

        const directives = ejb_store.getState().directives;
        if (!directives.length) {
            return [];
        }

        const completion_items: vscode.CompletionItem[] = [];

        for (const directive of directives) {
            const item = new vscode.CompletionItem(directive.name, vscode.CompletionItemKind.Keyword);
            item.insertText = directive.name;
            item.detail = directive.sourcePackage;
            item.documentation = new vscode.MarkdownString(directive.description);
            completion_items.push(item);
        }

        return completion_items;
    }
}