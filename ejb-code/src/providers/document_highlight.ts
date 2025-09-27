import * as vscode from 'vscode';
import { EJBLanguageService } from '@/languages/service';

export function registerDocumentHighlightProvider(context: vscode.ExtensionContext, languageService: EJBLanguageService) {
    const documentHighlightProvider: vscode.DocumentHighlightProvider = {
        provideDocumentHighlights(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentHighlight[]> {
            return languageService.findDocumentHighlights(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentHighlightProvider(
            'ejb',
            documentHighlightProvider
        )
    );
}
