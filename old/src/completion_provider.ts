import * as vscode from 'vscode';
import { Ejb } from '../../src';

export class EJBCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private ejb_instance: Ejb<boolean>) {}

    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
        const line_prefix = document.lineAt(position).text.substring(0, position.character);
        if (!line_prefix.endsWith('@')) {
            return undefined;
        }

        const directives = Object.values(this.ejb_instance.directives);
        if (!directives.length) {
            return [];
        }

        const completion_items: vscode.CompletionItem[] = [];

        for (const directive of directives) {
            // Ensure directive.name is a string before using it
            if (typeof directive.name !== 'string') {
                continue;
            }
            const item = new vscode.CompletionItem(directive.name, vscode.CompletionItemKind.Keyword);
            item.insertText = directive.name;
            // Assuming directive has sourcePackage and description properties
            item.detail = (directive as any).sourcePackage; 
            item.documentation = new vscode.MarkdownString((directive as any).description);
            completion_items.push(item);
        }

        return completion_items;
    }

    dispose() {}
}

