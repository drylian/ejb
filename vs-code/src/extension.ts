import * as vscode from 'vscode';
import { ejb_store } from './state';
import { EJBCompletionProvider } from './completion_provider';
import { EJBHoverProvider } from './hover_provider';
import { update_diagnostics } from './diagnostics';
import { register_semantic_tokens_provider } from './semantic_tokens_provider';
import { createEJB } from './ejb';

export function activate(context: vscode.ExtensionContext) {
    const output_channel = vscode.window.createOutputChannel('EJB');
    context.subscriptions.push(output_channel);
    output_channel.appendLine('[Extension] Activating...');

    try {
        ejb_store.getState().init(context, output_channel);
        output_channel.appendLine('[Extension] Store initialized.');

        // Create the EJB instance with virtualized directives
        const ejb_instance = createEJB(output_channel);
        output_channel.appendLine('[Extension] EJB instance created with virtualized directives.');

        const hover_provider = new EJBHoverProvider(output_channel, ejb_instance);
        const completion_provider = new EJBCompletionProvider();

        context.subscriptions.push(
            vscode.languages.registerHoverProvider('ejb', hover_provider),
            vscode.languages.registerCompletionItemProvider('ejb', completion_provider, '@')
        );
        output_channel.appendLine('[Extension] Hover and Completion providers registered.');

        const diagnostics_collection = vscode.languages.createDiagnosticCollection('ejb');
        context.subscriptions.push(diagnostics_collection);

        const run_diagnostics = (document: vscode.TextDocument) => {
            if (document.languageId === 'ejb') {
                update_diagnostics(document, diagnostics_collection, output_channel, ejb_instance);
            }
        };

        const unsubscribe = ejb_store.subscribe((state, prev_state) => {
            if (state.loading !== prev_state.loading && !state.loading) {
                output_channel.appendLine('[Extension] Config loaded. Rerunning diagnostics.');
                vscode.workspace.textDocuments.forEach(run_diagnostics);
            }
        });
        context.subscriptions.push({ dispose: unsubscribe });
        output_channel.appendLine('[Extension] Diagnostics configured.');

        if (vscode.window.activeTextEditor) {
            run_diagnostics(vscode.window.activeTextEditor.document);
        }

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(run_diagnostics));
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => run_diagnostics(event.document)));
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnostics_collection.delete(doc.uri)));

        register_semantic_tokens_provider(context, output_channel, ejb_instance);
        output_channel.appendLine('[Extension] Semantic Tokens provider registered.');

    } catch (error: any) {
        output_channel.appendLine(`[Extension] FATAL ERROR during activation: ${error.message}\n${error.stack}`);
    }

    output_channel.appendLine('[Extension] Activation complete.');
}

