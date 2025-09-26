import * as vscode from 'vscode';
import { ejb_store } from '@/core/state';
import { update_diagnostics } from '@/providers/diagnostics';
import { register_semantic_tokens_provider } from '@/providers/semantic_tokens';
import { createEJB } from '@/core/ejb';
import { EJB_Language_Service } from '@/languages/service';
import { EJBHoverProvider } from '@/providers/hover';
import { register_completion_provider } from '@/providers/completion';
 
export function activate(context: vscode.ExtensionContext) {
    const output_channel = vscode.window.createOutputChannel('EJB');
    context.subscriptions.push(output_channel);
    output_channel.appendLine('[Extension] Activating...');

    try {
        ejb_store.getState().init(context, output_channel);
        output_channel.appendLine('[Extension] Store initialized.');

        const ejb_instance = createEJB(output_channel);
        output_channel.appendLine('[Extension] EJB instance created.');

        const language_service = new EJB_Language_Service(ejb_instance);
        output_channel.appendLine('[Extension] Language Service created.');

        const hover_provider = new EJBHoverProvider(output_channel, ejb_instance, language_service as any);
        context.subscriptions.push(
            vscode.languages.registerHoverProvider('ejb', hover_provider)
        );

        register_completion_provider(context, language_service as any);
        output_channel.appendLine('[Extension] Hover and Completion providers registered.');

        const diagnostics_collection = vscode.languages.createDiagnosticCollection('ejb');
        context.subscriptions.push(diagnostics_collection);

        const onDocumentChange = (document: vscode.TextDocument) => {
            update_diagnostics(document, output_channel, ejb_instance, language_service as any, diagnostics_collection);
        };

        const unsubscribe = ejb_store.subscribe((state, prev_state) => {
            if (state.loading !== prev_state.loading && !state.loading) {
                output_channel.appendLine('[Extension] Config loaded. Rerunning diagnostics.');
                vscode.workspace.textDocuments.forEach(onDocumentChange);
            }
        });
        context.subscriptions.push({ dispose: unsubscribe });
        output_channel.appendLine('[Extension] Diagnostics configured.');

        if (vscode.window.activeTextEditor) {
            onDocumentChange(vscode.window.activeTextEditor.document);
        }

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(onDocumentChange));
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => onDocumentChange(event.document)));
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
            diagnostics_collection.delete(doc.uri);
        }));

        register_semantic_tokens_provider(context, output_channel, ejb_instance);
        output_channel.appendLine('[Extension] Semantic Tokens provider registered.');

    } catch (error: any) {
        output_channel.appendLine(`[Extension] FATAL ERROR during activation: ${error.message}\n${error.stack}`);
    }

    output_channel.appendLine('[Extension] Activation complete.');
}
