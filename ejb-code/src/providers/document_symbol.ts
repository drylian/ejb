import * as vscode from 'vscode';
import { EJBLanguageService } from '@/languages/service';

export function registerDocumentSymbolProvider(context: vscode.ExtensionContext, languageService: EJBLanguageService) {
    const documentSymbolProvider: vscode.DocumentSymbolProvider = {
        provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
            return languageService.findDocumentSymbols(document);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            'ejb',
            documentSymbolProvider
        )
    );
}
