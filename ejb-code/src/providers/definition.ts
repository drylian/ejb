import * as vscode from 'vscode';
import { EJB_Language_Service } from '@/languages/service';

export function register_definition_provider(context: vscode.ExtensionContext, language_service: EJB_Language_Service) {
    const definition_provider: vscode.DefinitionProvider = {
        provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
            return language_service.find_definition(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            'ejb',
            definition_provider
        )
    );
}