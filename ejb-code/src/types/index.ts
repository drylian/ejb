import type { EjbDirectivePlugin } from "ejb";
import type {
    Color,
    ColorInformation,
    ColorPresentation,
    CompletionItem,
    CompletionList,
    Definition,
    Diagnostic,
    DocumentHighlight,
    DocumentLink,
    FoldingRange,
    FormattingOptions,
    Hover,
    Location,
    Position,
    Range,
    SelectionRange,
    SignatureHelp,
    SymbolInformation,
    TextDocument,
    TextEdit,
    WorkspaceEdit
} from 'vscode-languageserver';
import { SemanticTokenData } from "vscode-languageserver/lib/common/protocol";
import type { DocumentContext } from 'vscode-html-languageservice';
import type { Uri } from "vscode";

export interface LanguageMode {
    dispose(): void;
    doAutoInsert?: (document: TextDocument, position: Position, kind: 'autoClose' | 'autoQuote') => Promise<string | null>;
    doComplete?: (document: TextDocument, position: Position, documentContext: DocumentContext, settings?: Settings) => Promise<CompletionList | undefined | null>;
    doHover?: (document: TextDocument, position: Position, settings?: Settings) => Promise<Hover | null>;
    doLinkedEditing?: (document: TextDocument, position: Position) => Promise<Range[] | null>;
    doRename?: (document: TextDocument, position: Position, newName: string) => Promise<WorkspaceEdit | null>;
    doResolve?: (document: TextDocument, item: CompletionItem) => Promise<CompletionItem>;
    doSignatureHelp?: (document: TextDocument, position: Position) => Promise<SignatureHelp | null>;
    doValidation?: (document: TextDocument, settings?: Settings) => Promise<Diagnostic[]>;
    findDefinition?: (document: TextDocument, position: Position) => Promise<Definition | null>;
    findDocumentColors?: (document: TextDocument) => Promise<ColorInformation[]>;
    findDocumentHighlights?: (document: TextDocument, position: Position) => Promise<DocumentHighlight[]>;
    findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => Promise<DocumentLink[]>;
    findDocumentSymbols?: (document: TextDocument) => Promise<SymbolInformation[]>;
    findMatchingTagPosition?: (document: TextDocument, position: Position) => Promise<Position | null>;
    findReferences?: (document: TextDocument, position: Position) => Promise<Location[]>;
    format?: (document: TextDocument, range: Range, options: FormattingOptions, settings?: Settings) => Promise<TextEdit[]>;
    getColorPresentations?: (document: TextDocument, color: Color, range: Range) => Promise<ColorPresentation[]>;
    getFoldingRanges?: (document: TextDocument) => Promise<FoldingRange[]>;
    getId(): string;
    getSelectionRanges?: (document: TextDocument, positions: Position[]) => Promise<SelectionRange[]>;
    getSemanticTokenLegend?(): { types: string[]; modifiers: string[] };
    getSemanticTokens?(document: TextDocument): Promise<SemanticTokenData[]>;
    onDocumentRemoved(document: TextDocument): void;
}

export interface Settings {
    css: any;
    html: any;
    javascript: any;
    typescript: any;
}

export interface LanguageModes {
    getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined;
    getAllModesInDocument(document: TextDocument): LanguageMode[];
    getAllModes(): LanguageMode[];
    getMode(languageId: string): LanguageMode | undefined;
    onDocumentRemoved(document: TextDocument): void;
    dispose(): void;
    getDocumentContext(document: TextDocument, position: Position): DocumentContext;
    getVirtualDocument(document: TextDocument, languageId: string): TextDocument | undefined;
    fromVirtualToOriginal(document: TextDocument, virtual_uri: Uri, range: Range): Range;
    toOriginalPosition(document: TextDocument, virtual_doc: TextDocument, position: Position): Position;
}

export interface EJBConfig {
    package: string;
    url?: string;
    directives: EjbDirectivePlugin[];
    includes?: string[];
}


export interface EnrichedDirective extends EjbDirectivePlugin {
    source_package: string;
    source_url?: string;
}

export interface Param {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'any';
    children?: boolean;
}

export interface Parent {
    name: string;
    description?: string;
}

import type { SourceLocation } from "ejb";

export interface SourceMapEntry {
    original_loc: SourceLocation;
    virtual_start_offset: number;
    virtual_end_offset: number;
}

export interface EmbeddedLanguage {
    content: string;
    source_map: SourceMapEntry[];
}

export interface ProcessedEJB {
    js: EmbeddedLanguage;
    html: EmbeddedLanguage;
}
