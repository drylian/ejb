import * as vscode from 'vscode';
import { EJBCompletionProvider } from './completion_provider';
import { EJBHoverProvider } from './hover_provider';
import { ConfigManager } from './config_manager';
import { updateDiagnostics } from './diagnostics';
import { createEJB } from './ejb'; // Import createEJB

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('EJB');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('EJB: A extensão está ativando...');

    const configManager = new ConfigManager(context, outputChannel);
    context.subscriptions.push(configManager);

    let ejb_instance: any; // Declare ejb_instance here

    const runDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'ejb' && ejb_instance) { // Ensure ejb_instance is available
            updateDiagnostics(document, diagnosticsCollection, ejb_instance); // Pass ejb_instance
        }
    };

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection('ejb');
    context.subscriptions.push(diagnosticsCollection);

    context.subscriptions.push(
        configManager.onDidFinishLoading(() => {
            const directives = configManager.getDirectives();
            ejb_instance = createEJB(outputChannel, directives); // Create Ejb instance

            // Re-register providers with the new ejb_instance
            const hoverProvider = new EJBHoverProvider(outputChannel, ejb_instance);
            const completionProvider = new EJBCompletionProvider(ejb_instance); // Assuming completion provider also needs ejb_instance

            context.subscriptions.push(
                vscode.languages.registerHoverProvider('ejb', hoverProvider),
                vscode.languages.registerCompletionItemProvider('ejb', completionProvider, '@')
            );

            outputChannel.appendLine('EJB: Configuração carregada. Re-executando diagnósticos em arquivos abertos.');
            vscode.workspace.textDocuments.forEach(runDiagnostics);
        })
    );

    // Initial run for active editor if config is already loaded (unlikely on first activation)
    if (vscode.window.activeTextEditor && ejb_instance) {
        runDiagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(runDiagnostics));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => runDiagnostics(event.document)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnosticsCollection.delete(doc.uri)));

    outputChannel.appendLine('EJB: Extensão ativada com sucesso.');
}