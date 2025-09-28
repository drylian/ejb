import type * as vscode from 'vscode';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export abstract class BaseLanguageService {
    abstract doHover(document: TextDocument, position: vscode.Position): vscode.Hover | null;
    abstract doComplete(document: TextDocument, position: vscode.Position): vscode.CompletionList | null;
    abstract doValidation(document: TextDocument): vscode.Diagnostic[];
    abstract findDefinition(document: TextDocument, position: vscode.Position): vscode.Definition | null;
    abstract findDocumentHighlights(document: TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null;
    abstract findDocumentSymbols(document: TextDocument): vscode.SymbolInformation[] | null;
}
