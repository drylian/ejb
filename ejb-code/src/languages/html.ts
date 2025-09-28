import * as vscode from 'vscode';
import { getLanguageService, CompletionItemKind as HTMLCompletionItemKind } from 'vscode-html-languageservice';
import { BaseLanguageService } from './base';

export class HTMLanguageService extends BaseLanguageService {
    private languageService = getLanguageService();

    doHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const htmlDocument = this.languageService.parseHTMLDocument(document as any);
        const hover = this.languageService.doHover(document as any, position, htmlDocument);
        if (!hover) return null;
        return new vscode.Hover(hover.contents as any, hover.range ? new vscode.Range(hover.range.start.line, hover.range.start.character, hover.range.end.line, hover.range.end.character) : undefined);
    }

    doComplete(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionList | null {
        const htmlDocument = this.languageService.parseHTMLDocument(document as any);
        const completions = this.languageService.doComplete(document as any, position, htmlDocument);
        if (!completions) return null;
        return new vscode.CompletionList(completions.items.map(i => new vscode.CompletionItem(i.label, this.convertHtmlCompletionKind(i.kind))), completions.isIncomplete);
    }

    doValidation(_document: vscode.TextDocument): vscode.Diagnostic[] {
        return [];
    }

    findDefinition(_document: vscode.TextDocument, _position: vscode.Position): vscode.Definition | null {
        return null;
    }

    findDocumentHighlights(document: vscode.TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null {
        const htmlDocument = this.languageService.parseHTMLDocument(document as any);
        const highlights = this.languageService.findDocumentHighlights(document as any, position, htmlDocument);
        if (!highlights) return null;
        return highlights.map(h => new vscode.DocumentHighlight(new vscode.Range(h.range.start.line, h.range.start.character, h.range.end.line, h.range.end.character), h.kind as vscode.DocumentHighlightKind));
    }

    findDocumentSymbols(document: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const htmlDocument = this.languageService.parseHTMLDocument(document as any);
        const symbols = this.languageService.findDocumentSymbols(document as any, htmlDocument);
        if (!symbols) return null;
        return symbols.map(s => new vscode.SymbolInformation(s.name, s.kind as vscode.SymbolKind, s.containerName || '', new vscode.Location(document.uri, new vscode.Range(s.location.range.start.line, s.location.range.start.character, s.location.range.end.line, s.location.range.end.character))));
    }

    private convertHtmlCompletionKind(kind: HTMLCompletionItemKind | undefined): vscode.CompletionItemKind {
        if (kind === undefined) return vscode.CompletionItemKind.Text;
        return kind - 1;
    }
}
