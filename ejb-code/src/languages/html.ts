
import { getLanguageService as getHTMLLanguageService, type LanguageService, type LanguageServiceOptions, DocumentContext, FormattingOptions, HTMLDocument, Position, Range, TextDocument, TextEdit } from "vscode-html-languageservice";
import type { LanguageMode, Settings } from "./types";

export function get_html_language_mode(options: LanguageServiceOptions): LanguageMode {
    const html_language_service = getHTMLLanguageService(options);

    return {
        getId: () => "html",
        doHover(document: TextDocument, position: Position, settings?: Settings) {
            return html_language_service.doHover(document, position, settings?.html,);
        },
        doComplete(document: TextDocument, position: Position, documentContext: DocumentContext, settings?: Settings) {
            return html_language_service.doComplete(document, position, settings?.html, documentContext);
        },
        findDocumentHighlights(document: TextDocument, position: Position) {
            return Promise.resolve(html_language_service.findDocumentHighlights(document, position, html_language_service.parseHTMLDocument(document)));
        },
        findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
            return Promise.resolve(html_language_service.findDocumentLinks(document, documentContext));
        },
        findDocumentSymbols(document: TextDocument) {
            return Promise.resolve(html_language_service.findDocumentSymbols(document, html_language_service.parseHTMLDocument(document)));
        },
        format(document: TextDocument, range: Range, options: FormattingOptions, settings?: Settings) {
            return Promise.resolve(html_language_service.format(document, range, settings?.html.format || options));
        },
        getFoldingRanges(document: TextDocument) {
            return Promise.resolve(html_language_service.getFoldingRanges(document));
        },
        getSelectionRanges(document: TextDocument, positions: Position[]) {
            return Promise.resolve(html_language_service.getSelectionRanges(document, positions));
        },
        doRename(document: TextDocument, position: Position, newName: string) {
            const htmlDocument = html_language_service.parseHTMLDocument(document);
            return Promise.resolve(html_language_service.doRename(document, position, newName, htmlDocument));
        },
        findMatchingTagPosition(document: TextDocument, position: Position) {
            const htmlDocument = html_language_service.parseHTMLDocument(document);
            return Promise.resolve(html_language_service.findMatchingTagPosition(document, position, htmlDocument));
        },
        onDocumentRemoved(document: TextDocument) { },
        dispose() { },
    };
}
