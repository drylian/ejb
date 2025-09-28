import * as vscode from 'vscode';
import { ejbStore } from '@/core/state';
import { updateDiagnostics } from '@/providers/diagnostics';
import { registerSemanticTokensProvider } from '@/providers/semantic_tokens';
import { createEJB } from '@/core/ejb';
import { EJBLanguageService } from '@/languages/service';
import { EJBHoverProvider } from '@/providers/hover';
import { registerCompletionProvider } from '@/providers/completion';
import { registerDocumentHighlightProvider } from '@/providers/document_highlight';
import { registerDocumentSymbolProvider } from '@/providers/document_symbol';
import { registerDefinitionProvider } from '@/providers/definition';
import { TextDecoder } from 'util';
 
export async function activate(context: vscode.ExtensionContext) {
    // Step 1: Create Output Channel
    const outputChannel = vscode.window.createOutputChannel('EJB');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('[Extension] Activating...');

    try {
        // Step 2: Initialize Store and EJB Instance
        ejbStore.getState().init(context, outputChannel);
        outputChannel.appendLine('[Extension] Store initialized.');

        const ejbInstance = createEJB(outputChannel);
        outputChannel.appendLine('[Extension] EJB instance created.');

        // Step 3: Create Language Service
        const libPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'typescript', 'lib', 'lib.esnext.d.ts');
        const libContentBuffer = await vscode.workspace.fs.readFile(libPath);
        const libContent = new TextDecoder().decode(libContentBuffer);
        const languageService = new EJBLanguageService(ejbInstance, libContent);
        outputChannel.appendLine('[Extension] Language Service created.');

        // Step 4: Register Providers
        const hoverProvider = new EJBHoverProvider(languageService);
        context.subscriptions.push(
            vscode.languages.registerHoverProvider('ejb', hoverProvider)
        );

        registerCompletionProvider(context, languageService);
        registerDocumentHighlightProvider(context, languageService);
        registerDocumentSymbolProvider(context, languageService);
        registerDefinitionProvider(context, languageService);
        outputChannel.appendLine('[Extension] Hover, Completion, Highlight, Symbol and Definition providers registered.');

        // Step 5: Configure Diagnostics
        const diagnosticsCollection = vscode.languages.createDiagnosticCollection('ejb');
        context.subscriptions.push(diagnosticsCollection);

        const onDocumentChange = (document: vscode.TextDocument) => {
            updateDiagnostics(document, diagnosticsCollection, languageService);
        };

        const unsubscribe = ejbStore.subscribe((state, prevState) => {
            if (state.loading !== prevState.loading && !state.loading) {
                outputChannel.appendLine('[Extension] Config loaded. Rerunning diagnostics.');
                vscode.workspace.textDocuments.forEach(onDocumentChange);
            }
        });
        context.subscriptions.push({ dispose: unsubscribe });
        outputChannel.appendLine('[Extension] Diagnostics configured.');

        if (vscode.window.activeTextEditor) {
            onDocumentChange(vscode.window.activeTextEditor.document);
        }

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(onDocumentChange));
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => onDocumentChange(event.document)));
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
            diagnosticsCollection.delete(doc.uri);
        }));

        // Step 6: Register Semantic Tokens Provider
        registerSemanticTokensProvider(context, outputChannel, ejbInstance);
        outputChannel.appendLine('[Extension] Semantic Tokens provider registered.');

    } catch (error: any) {
        outputChannel.appendLine(`[Extension] FATAL ERROR during activation: ${error.message}\n${error.stack}`);
    }

    outputChannel.appendLine('[Extension] Activation complete.');
}
