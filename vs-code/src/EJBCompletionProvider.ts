import * as vscode from 'vscode';
import { EJBConfigManager } from './EJBConfigManager';

export class EJBCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private configManager: EJBConfigManager) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        // Verificar se a operação foi cancelada
        if (token.isCancellationRequested) {
            return [];
        }

        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, position.character);

        // Only trigger after @ symbol
        const atIndex = linePrefix.lastIndexOf('@');
        if (atIndex === -1 || position.character - atIndex > 20) {
            return [];
        }

        const items: vscode.CompletionItem[] = [];
        const directives = this.configManager.getAllDirectives();

        for (const directive of directives) {
            // Verificar se a operação foi cancelada a cada iteração
            if (token.isCancellationRequested) {
                return [];
            }

            const item = new vscode.CompletionItem(directive.name, vscode.CompletionItemKind.Function);
            item.detail = `@${directive.name}`;
            item.documentation = new vscode.MarkdownString(directive.description);
            item.sortText = directive.name;

            if (directive.children) {
                if (directive.params?.length) {
                    const params = directive.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
                    item.insertText = new vscode.SnippetString(`${directive.name}(${params})\n\t$0\n@end`);
                } else {
                    item.insertText = new vscode.SnippetString(`${directive.name}\n\t$0\n@end`);
                }
            } else {
                if (directive.params?.length) {
                    const params = directive.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
                    item.insertText = new vscode.SnippetString(`${directive.name}(${params})`);
                } else {
                    item.insertText = directive.name;
                }
            }

            items.push(item);
        }

        return items;
    }
}