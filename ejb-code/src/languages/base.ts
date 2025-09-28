import * as vscode from 'vscode';

export abstract class BaseLanguageService {
    abstract doHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null;
    abstract doComplete(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionList | null;
    abstract doValidation(document: vscode.TextDocument): vscode.Diagnostic[];
    abstract findDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition | null;
    abstract findDocumentHighlights(document: vscode.TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null;
    abstract findDocumentSymbols(document: vscode.TextDocument): vscode.SymbolInformation[] | null;
}
