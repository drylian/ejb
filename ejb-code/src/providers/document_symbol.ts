import * as vscode from 'vscode';
import { EJB_Language_Service } from '@/languages/service';

export function register_document_symbol_provider(context: vscode.ExtensionContext, language_service: EJB_Language_Service) {
    const document_symbol_provider: vscode.DocumentSymbolProvider = {
        provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
            return language_service.find_document_symbols(document);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            'ejb',
            document_symbol_provider
        )
    );
}