import * as vscode from 'vscode';
import { ejbStore } from '@/core/state';
import { EJBLanguageService } from '@/languages/service';

export function registerCompletionProvider(context: vscode.ExtensionContext, languageService: EJBLanguageService) {
    const completionProvider: vscode.CompletionItemProvider = {
        async provideCompletionItems(document, position, _token, context) {
            const linePrefix = document.lineAt(position).text.substring(0, position.character);
            if (context.triggerCharacter === '@' || linePrefix.endsWith('@')) {
                const { directives, loading } = ejbStore.getState();
                if (loading || !directives.length) {
                    return [];
                }

                return directives.map(directive => {
                    const item = new vscode.CompletionItem(directive.name.toString(), vscode.CompletionItemKind.Keyword);
                    item.insertText = directive.name.toString();
                    item.detail = directive.sourcePackage;
                    item.documentation = new vscode.MarkdownString(directive.description);
                    return item;
                });
            }
            
            return languageService.doComplete(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'ejb',
            completionProvider,
            '@', '.', '(', ' ', "'", '"')
    );
}
