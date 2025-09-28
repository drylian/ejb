import * as vscode from 'vscode';
import { Ejb, ejbParser, type AstNode, type RootNode, EjbAst, type DirectiveNode, type InterpolationNode, type SourceLocation } from 'ejb';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HTMLLanguageService } from './html';
import { TypeScriptLanguageService } from './typescript';
import { EJBDirectiveLanguageService } from './ejb';
import type { Position as LspPosition } from 'vscode-languageserver-types';

function isOffsetWithinRange(offset: number, range: { start: { offset: number; }; end: { offset: number; }; }) {
    return offset >= range.start.offset && offset <= range.end.offset;
}

interface SourceMapEntry {
    originalLoc: SourceLocation;
    virtualStartOffset: number;
    virtualEndOffset: number;
}

class ParsedEJBDocument {
    public version: number;
    public text: string;
    public ast: RootNode;

    public htmlDoc: TextDocument;
    public tsDoc: TextDocument;
    private tsMap: SourceMapEntry[] = [];

    constructor(public document: vscode.TextDocument, private ejbInstance: Ejb<boolean>) {
        this.version = document.version;
        this.text = document.getText();
        this.ast = ejbParser(this.ejbInstance, this.text);
        
        let htmlContent = this.text;
        let tsContent = '';

        const walk = (node: AstNode) => {
            if (!node.loc) return;

            if (node.type === EjbAst.Directive || node.type === EjbAst.Interpolation) {
                const start = node.loc.start.offset;
                const end = node.loc.end.offset;
                htmlContent = htmlContent.substring(0, start) + ' '.repeat(end - start) + htmlContent.substring(end);
            }

            let expression: string | undefined;
            let expressionLoc: SourceLocation | undefined;

            if (node.type === EjbAst.Directive) {
                const directive = node as DirectiveNode;
                const def = this.ejbInstance.directives[directive.name];

                if (directive.expression) {
                    expression = directive.expression;
                    expressionLoc = (node as any).expression_loc || node.loc;
                }

                if ((def?.children_type ?? 'html') === 'js' && directive.children.length > 0) {
                    const startNode = directive.children[0];
                    const endNode = directive.children[directive.children.length - 1];
                    if (startNode.loc && endNode.loc) {
                        const content = this.text.substring(startNode.loc.start.offset, endNode.loc.end.offset);
                        const loc: SourceLocation = { start: startNode.loc.start, end: endNode.loc.end };
                        this.tsMap.push({ originalLoc: loc, virtualStartOffset: tsContent.length, virtualEndOffset: tsContent.length + content.length });
                        tsContent += content + '\n';
                    }
                }
            } else if (node.type === EjbAst.Interpolation) {
                expression = (node as InterpolationNode).expression;
                expressionLoc = (node as any).expression_loc || node.loc;
            }

            if (expression && expressionLoc) {
                const content = `(${expression});`;
                this.tsMap.push({ originalLoc: expressionLoc, virtualStartOffset: tsContent.length, virtualEndOffset: tsContent.length + content.length });
                tsContent += content + '\n';
            }

            if ('children' in node) {
                node.children.forEach(walk);
            }
        };

        walk(this.ast);

        this.htmlDoc = TextDocument.create(this.document.uri.with({ scheme: 'ejb-html', path: this.document.uri.path + '.html' }).toString(), 'html', this.document.version, htmlContent);
        this.tsDoc = TextDocument.create(this.document.uri.with({ scheme: 'ejb-ts', path: this.document.uri.path + '.ts' }).toString(), 'typescript', this.document.version, tsContent);
    }

    public getLanguageAt(position: vscode.Position): 'html' | 'ts' | 'ejb' {
        const offset = this.document.offsetAt(position);
        const wordRange = this.document.getWordRangeAtPosition(position, /@\w+/);
        if (wordRange?.contains(position)) {
            return 'ejb';
        }

        const node = this.findNodeAt(offset);
        if (node) {
            if (node.type === EjbAst.Directive) {
                const def = this.ejbInstance.directives[(node as DirectiveNode).name];
                if ((def?.children_type ?? 'html') === 'js' && (node as any).children_range && isOffsetWithinRange(offset, (node as any).children_range)) {
                    return 'ts';
                }
                if ((node as any).expression_loc && isOffsetWithinRange(offset, (node as any).expression_loc)) {
                    return 'ts';
                }
            } else if (node.type === EjbAst.Interpolation && (node as any).expression_loc && isOffsetWithinRange(offset, (node as any).expression_loc)) {
                return 'ts';
            }
        }

        return 'html';
    }

    private findNodeAt(offset: number): AstNode | null {
        const find = (node: AstNode): AstNode | null => {
            if (!node.loc || !isOffsetWithinRange(offset, node.loc)) return null;

            if ('children' in node) {
                for (const child of node.children) {
                    const found = find(child);
                    if (found) return found;
                }
            }
            return node;
        };
        return find(this.ast);
    }

    public toVirtualPosition(pos: vscode.Position): LspPosition | null {
        const offset = this.document.offsetAt(pos);
        const entry = this.tsMap.find(m => isOffsetWithinRange(offset, m.originalLoc));
        if (entry) {
            const virtualOffset = entry.virtualStartOffset + (offset - entry.originalLoc.start.offset);
            return this.tsDoc.positionAt(virtualOffset);
        }
        return null;
    }

    public toOriginalRange(range: vscode.Range): vscode.Range | null {
        const startOffset = this.tsDoc.offsetAt(range.start);
        const endOffset = this.tsDoc.offsetAt(range.end);

        const entry = this.tsMap.find(m => startOffset >= m.virtualStartOffset && endOffset <= m.virtualEndOffset);
        if (entry) {
            const originalStartOffset = entry.originalLoc.start.offset + (startOffset - entry.virtualStartOffset);
            const originalEndOffset = entry.originalLoc.start.offset + (endOffset - entry.virtualStartOffset);
            return new vscode.Range(
                this.document.positionAt(originalStartOffset),
                this.document.positionAt(originalEndOffset)
            );
        }
        return null;
    }
}

export class EJBLanguageService {
    private docCache = new Map<string, ParsedEJBDocument>();
    private htmlLanguageService = new HTMLLanguageService();
    private tsLanguageService: TypeScriptLanguageService;
    private ejbLanguageService = new EJBDirectiveLanguageService();

    constructor(private ejbInstance: Ejb<boolean>, tsLibContent: string) {
        this.tsLanguageService = new TypeScriptLanguageService(tsLibContent);
    }

    private getParsedDoc(doc: vscode.TextDocument): ParsedEJBDocument {
        const cached = this.docCache.get(doc.uri.toString());
        if (cached && cached.version === doc.version) {
            return cached;
        }
        const parsed = new ParsedEJBDocument(doc, this.ejbInstance);
        this.docCache.set(doc.uri.toString(), parsed);
        return parsed;
    }

    public doHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'ejb') {
            return this.ejbLanguageService.doHover(doc, pos);
        }

        if (lang === 'html') {
            return this.htmlLanguageService.doHover(parsedDoc.htmlDoc, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;
            const hover = this.tsLanguageService.doHover(parsedDoc.tsDoc, new vscode.Position(virtualPos.line, virtualPos.character));
            if (hover && hover.range) {
                const originalRange = parsedDoc.toOriginalRange(hover.range);
                if (originalRange) {
                    return new vscode.Hover(hover.contents, originalRange);
                }
            }
            return hover;
        }

        return null;
    }

    public doComplete(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionList | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'ejb') {
            return this.ejbLanguageService.doComplete(doc, pos);
        }

        if (lang === 'html') {
            return this.htmlLanguageService.doComplete(parsedDoc.htmlDoc, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;
            return this.tsLanguageService.doComplete(parsedDoc.tsDoc, new vscode.Position(virtualPos.line, virtualPos.character));
        }

        return null;
    }
    
    public doValidation(doc: vscode.TextDocument): vscode.Diagnostic[] {
        const parsedDoc = this.getParsedDoc(doc);
        const ejbErrors: vscode.Diagnostic[] = parsedDoc.ast.errors.map(error => {
            const range = new vscode.Range(
                new vscode.Position(error.loc.start.line - 1, error.loc.start.column - 1),
                new vscode.Position(error.loc.end.line - 1, error.loc.end.column - 1)
            );
            return new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
        });

        const htmlDiagnostics = this.htmlLanguageService.doValidation(parsedDoc.htmlDoc);

        const tsDiagnostics = this.tsLanguageService.doValidation(parsedDoc.tsDoc);
        const mappedTsDiagnostics = tsDiagnostics.map(diag => {
            const originalRange = parsedDoc.toOriginalRange(diag.range);
            if (originalRange) {
                return new vscode.Diagnostic(originalRange, diag.message, diag.severity);
            }
            return null;
        }).filter((d): d is vscode.Diagnostic => d !== null);

        return [...ejbErrors, ...htmlDiagnostics, ...mappedTsDiagnostics];
    }

    public findDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Definition | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;
            const definition = this.tsLanguageService.findDefinition(parsedDoc.tsDoc, new vscode.Position(virtualPos.line, virtualPos.character));
            if (definition) {
                // This assumes definition is a single location
                const loc = Array.isArray(definition) ? definition[0] : definition;
                const originalRange = parsedDoc.toOriginalRange(loc.range);
                if (originalRange) {
                    return new vscode.Location(doc.uri, originalRange);
                }
            }
        }
        return null;
    }

    public findDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'html') {
            return this.htmlLanguageService.findDocumentHighlights(parsedDoc.htmlDoc, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;
            const highlights = this.tsLanguageService.findDocumentHighlights(parsedDoc.tsDoc, new vscode.Position(virtualPos.line, virtualPos.character));
            if (!highlights) return null;

            return highlights.map(h => {
                const originalRange = parsedDoc.toOriginalRange(h.range);
                if (originalRange) {
                    return new vscode.DocumentHighlight(originalRange, h.kind);
                }
                return h; // Fallback, though range will be incorrect
            });
        }

        return null;
    }

    public findDocumentSymbols(doc: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        const htmlSymbols = this.htmlLanguageService.findDocumentSymbols(parsedDoc.htmlDoc) || [];
        const tsSymbols = this.tsLanguageService.findDocumentSymbols(parsedDoc.tsDoc) || [];

        const mappedTsSymbols = tsSymbols.map(s => {
            const originalRange = parsedDoc.toOriginalRange(s.location.range);
            if (originalRange) {
                return new vscode.SymbolInformation(s.name, s.kind, s.containerName, new vscode.Location(doc.uri, originalRange));
            }
            return s;
        });

        return [...htmlSymbols, ...mappedTsSymbols];
    }
}