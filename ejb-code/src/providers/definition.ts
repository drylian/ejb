import * as vscode from 'vscode';
import { EJBLanguageService } from '@/languages/service';

export function registerDefinitionProvider(context: vscode.ExtensionContext, languageService: EJBLanguageService) {
    const definitionProvider: vscode.DefinitionProvider = {
        provideDefinition(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
            return languageService.findDefinition(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            'ejb',
            definitionProvider
        )
    );
}
