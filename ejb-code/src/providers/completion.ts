import * as vscode from 'vscode';
import { ejb_store } from '@/core/state';
import { EJB_Language_Service } from '@/languages/service';

export function register_completion_provider(context: vscode.ExtensionContext, language_service: EJB_Language_Service) {
    const completion_provider: vscode.CompletionItemProvider = {
        async provideCompletionItems(document, position, token, context) {
            const line_prefix = document.lineAt(position).text.substring(0, position.character);
            if (context.triggerCharacter === '@' || line_prefix.endsWith('@')) {
                const { directives, loading } = ejb_store.getState();
                if (loading || !directives.length) {
                    return [];
                }

                return directives.map(directive => {
                    const item = new vscode.CompletionItem(directive.name.toString(), vscode.CompletionItemKind.Keyword);
                    item.insertText = directive.name.toString();
                    item.detail = directive.source_package;
                    item.documentation = new vscode.MarkdownString(directive.description);
                    return item;
                });
            }
            
            return language_service.do_complete(document, position, context);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'ejb',
            completion_provider,
            '@', '.', '(', ' ', "'", '"')
    );
}