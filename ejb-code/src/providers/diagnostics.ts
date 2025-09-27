import * as vscode from 'vscode';
import { EJBLanguageService } from '@/languages/service';

export function updateDiagnostics(
    document: vscode.TextDocument, 
    diagnosticsCollection: vscode.DiagnosticCollection,
    languageService: EJBLanguageService
) {
    if (document.languageId !== 'ejb') return;

    const diagnostics = languageService.doValidation(document);
    diagnosticsCollection.set(document.uri, diagnostics);
}
