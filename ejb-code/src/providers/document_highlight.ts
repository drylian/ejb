import * as vscode from 'vscode';
import { EJB_Language_Service } from '@/languages/service';

export function register_document_highlight_provider(context: vscode.ExtensionContext, language_service: EJB_Language_Service) {
    const document_highlight_provider: vscode.DocumentHighlightProvider = {
        provideDocumentHighlights(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentHighlight[]> {
            return language_service.find_document_highlights(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentHighlightProvider(
            'ejb',
            document_highlight_provider
        )
    );
}