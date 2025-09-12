import * as vscode from 'vscode';
import { ejbParser, Ejb } from './ejb';

export function update_diagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection, output_channel: vscode.OutputChannel, ejb_instance: Ejb<boolean>): void {
    if (document.languageId !== 'ejb') {
        return;
    }

    output_channel.appendLine(`[Diagnostics] Analyzing ${document.uri.fsPath}`);
    const diagnostics: vscode.Diagnostic[] = [];

    try {
        // Try to parse the file to catch syntax errors
        ejbParser(ejb_instance, document.getText());
        // Clear previous diagnostics on successful parse
        collection.clear();
    } catch (error: any) {
        output_channel.appendLine(`[Diagnostics] Error parsing ${document.uri.fsPath}: ${error.message}`);
        // If parsing fails, create a diagnostic
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 100)); // Default to first line
        const diagnostic = new vscode.Diagnostic(
            range,
            `EJB Syntax Error: ${error.message}`,
            vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
        collection.set(document.uri, diagnostics);
    }
}