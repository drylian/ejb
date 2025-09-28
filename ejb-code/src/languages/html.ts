import * as vscode from 'vscode';
import { getLanguageService, type LanguageService as HTMLService, type HTMLDocument, MarkedString, MarkupContent, DocumentHighlightKind, SymbolKind as LspSymbolKind } from 'vscode-html-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseLanguageService } from './base';

function toVscodeRange(range: import('vscode-languageserver-types').Range): vscode.Range {
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

function toVscodeMarkdown(content: string | MarkupContent | MarkedString | MarkedString[]): vscode.MarkdownString[] {
    if (typeof content === 'string') {
        return [new vscode.MarkdownString(content)];
    }
    if (Array.isArray(content)) {
        return content.map(item => {
            if (typeof item === 'string') {
                return new vscode.MarkdownString(item);
            }
            return new vscode.MarkdownString(`\`\`\`${item.language}\`\`\`\n${item.value}\n\`\`\`
`);
        });
    }
    if (MarkupContent.is(content)) {
        return [new vscode.MarkdownString(content.value)];
    }
    return [new vscode.MarkdownString(`\`\`\`${content.language}\`\`\`\n${content.value}\n\`\`\`
`)];
}

function toVscodeSymbolKind(kind: LspSymbolKind): vscode.SymbolKind {
    // This is a partial mapping. A complete one would be more complex.
    if (kind >= 1 && kind <= 26) {
        return kind - 1;
    }
    return vscode.SymbolKind.Variable;
}

export class HTMLLanguageService extends BaseLanguageService {
    private htmlService: HTMLService = getLanguageService({});

    private getHTMLDocument(document: TextDocument): HTMLDocument {
        return this.htmlService.parseHTMLDocument(document);
    }

    doHover(document: TextDocument, position: vscode.Position): vscode.Hover | null {
        const htmlDocument = this.getHTMLDocument(document);
        const hover = this.htmlService.doHover(document, position, htmlDocument);
        if (!hover) return null;
        return new vscode.Hover(toVscodeMarkdown(hover.contents), hover.range ? toVscodeRange(hover.range) : undefined);
    }

    doComplete(document: TextDocument, position: vscode.Position): vscode.CompletionList | null {
        const htmlDocument = this.getHTMLDocument(document);
        const completions = this.htmlService.doComplete(document, position, htmlDocument);
        if (!completions) return null;
        const items = completions.items.map(item => {
            const newItem = new vscode.CompletionItem(item.label, item.kind ? (item.kind as number - 1) : vscode.CompletionItemKind.Text);
            return newItem;
        });
        return new vscode.CompletionList(items, completions.isIncomplete);
    }
    
    doValidation(_document: TextDocument): vscode.Diagnostic[] {
        return [];
    }

    findDefinition(_document: TextDocument, _position: vscode.Position): vscode.Definition | null {
        return null;
    }

    findDocumentHighlights(document: TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null {
        const htmlDocument = this.getHTMLDocument(document);
        const highlights = this.htmlService.findDocumentHighlights(document, position, htmlDocument);
        if (!highlights) return null;
        return highlights.map(h => new vscode.DocumentHighlight(toVscodeRange(h.range), h.kind ? h.kind - 1 : DocumentHighlightKind.Text - 1));
    }

    findDocumentSymbols(document: TextDocument): vscode.SymbolInformation[] | null {
        const htmlDocument = this.getHTMLDocument(document);
        const symbols = this.htmlService.findDocumentSymbols(document, htmlDocument);
        if (!symbols) return null;
        return symbols.map(s => new vscode.SymbolInformation(s.name, toVscodeSymbolKind(s.kind), s.containerName || '', new vscode.Location(vscode.Uri.parse(document.uri), toVscodeRange(s.location.range))));
    }
}