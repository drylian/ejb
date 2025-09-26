import * as vscode from 'vscode';
import { ejbParser, Ejb, type RootNode } from 'ejb';
import { EJB_Language_Service } from '@/languages/service';

export async function update_diagnostics(
    document: vscode.TextDocument, 
    output_channel: vscode.OutputChannel, 
    diagnostics_collection: vscode.DiagnosticCollection,
    language_service: EJB_Language_Service
) {
    if (document.languageId !== 'ejb') return;

    const diagnostics = await language_service.do_validation(document);
    diagnostics_collection.set(document.uri, diagnostics);
}