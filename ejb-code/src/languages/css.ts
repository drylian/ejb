
import { getCSSLanguageService, type LanguageService, type LanguageServiceOptions,type DocumentContext, type FormattingOptions, Position, Range, TextDocument } from "vscode-css-languageservice";
import type { LanguageMode, Settings } from "./types";

export function get_css_language_mode(options: LanguageServiceOptions): LanguageMode {
    const css_language_service = getCSSLanguageService(options);

    return {
        getId: () => "css",
        doValidation(document: TextDocument, settings?: Settings) {
            return Promise.resolve(css_language_service.doValidation(document, css_language_service.parseStylesheet(document), settings?.css));
        },
        doHover(document: TextDocument, position: Position, settings?: Settings) {
            return css_language_service.doHover(document, position, css_language_service.parseStylesheet(document));
        },
        doComplete(document: TextDocument, position: Position, documentContext: DocumentContext, settings?: Settings) {
            return css_language_service.doComplete(document, position, css_language_service.parseStylesheet(document));
        },
        findDocumentHighlights(document: TextDocument, position: Position) {
            return Promise.resolve(css_language_service.findDocumentHighlights(document, position, css_language_service.parseStylesheet(document)));
        },
        findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
            return Promise.resolve(css_language_service.findDocumentLinks(document, documentContext));
        },
        findDocumentSymbols(document: TextDocument) {
            return Promise.resolve(css_language_service.findDocumentSymbols(document, css_language_service.parseStylesheet(document)));
        },
        format(document: TextDocument, range: Range, options: FormattingOptions, settings?: Settings) {
            return Promise.resolve(css_language_service.format(document, range, settings?.css.format || options));
        },
        getFoldingRanges(document: TextDocument) {
            return Promise.resolve(css_language_service.getFoldingRanges(document));
        },
        getSelectionRanges(document: TextDocument, positions: Position[]) {
            return Promise.resolve(css_language_service.getSelectionRanges(document, positions));
        },
        doRename(document: TextDocument, position: Position, newName: string) {
            const stylesheet = css_language_service.parseStylesheet(document);
            return Promise.resolve(css_language_service.doRename(document, position, newName, stylesheet));
        },
        findMatchingTagPosition(document: TextDocument, position: Position) {
            return Promise.resolve(null);
        },
        onDocumentRemoved(document: TextDocument) { },
        dispose() { },
    };
}
