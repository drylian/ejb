import * as vscode from 'vscode';
import { Ejb, ejbParser, type AstNode, type RootNode, EjbAst, type DirectiveNode, type InterpolationNode, type SourceLocation, type EjbError } from 'ejb';
import type { SourceMapEntry } from '@/types/index';
import { ejbStore } from '@/core/state';
import { HTMLanguageService } from './html';
import { TypeScriptLanguageService } from './typescript';
import { EJBLanguageService as EJBDirectiveLanguageService } from './ejb';

function isOffsetWithinRange(offset: number, range: { start: { offset: number; }; end: { offset: number; }; }) {
    return offset >= range.start.offset && offset <= range.end.offset;
}

class ParsedEJBDocument {
    public version: number;
    public text: string;
    public ast: RootNode;
    private ejbInstance: Ejb<boolean>;

    public htmlContent: string = '';
    public tsContent: string = '';
    private tsMap: SourceMapEntry[] = [];

    constructor(public document: vscode.TextDocument, ejbInstance: Ejb<boolean>) {
        this.version = document.version;
        this.text = document.getText();
        this.ejbInstance = ejbInstance;
        this.ast = ejbParser(this.ejbInstance, this.text);
        this.parse();
    }

    private parse() {
        let html = this.text;
        let ts = '';
        const tsMap: SourceMapEntry[] = [];

        const walk = (node: AstNode) => {
            if (!node.loc) return;

            if (node.type === EjbAst.Directive || node.type === EjbAst.Interpolation) {
                const start = node.loc.start.offset;
                const end = node.loc.end.offset;
                html = html.substring(0, start) + ' '.repeat(end - start) + html.substring(end);
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
                        tsMap.push({ originalLoc: loc, virtualStartOffset: ts.length, virtualEndOffset: ts.length + content.length });
                        ts += content + '\n';
                    }
                }
            } else if (node.type === EjbAst.Interpolation) {
                expression = (node as InterpolationNode).expression;
                expressionLoc = (node as any).expression_loc || node.loc;
            }

            if (expression && expressionLoc) {
                const content = `(${expression});`;
                tsMap.push({ originalLoc: expressionLoc, virtualStartOffset: ts.length, virtualEndOffset: ts.length + content.length });
                ts += content + '\n';
            }

            if ('children' in node) {
                node.children.forEach(walk);
            }
        };

        walk(this.ast);

        this.htmlContent = html;
        this.tsContent = ts;
        this.tsMap = tsMap;
    }

    public getLanguageAt(position: vscode.Position): 'html' | 'ts' | 'ejb' {
        const offset = this.document.offsetAt(position);
        const wordRange = this.document.getWordRangeAtPosition(position, /@\w+/);
        if (wordRange) {
            return 'ejb';
        }

        let language: 'html' | 'ts' = 'html';

        const findNode = (node: AstNode): AstNode | null => {
            if (!node.loc || !isOffsetWithinRange(offset, node.loc)) return null;

            if ('children' in node) {
                for (const child of node.children) {
                    const found = findNode(child);
                    if (found) return found;
                }
            }
            return node;
        };

        const node = findNode(this.ast);

        if (node) {
            if (node.type === EjbAst.Directive) {
                const def = this.ejbInstance.directives[(node as DirectiveNode).name];
                if ((def?.children_type ?? 'html') === 'js' && isOffsetWithinRange(offset, (node as any).children_range)) {
                    language = 'ts';
                }
                if ((node as any).expression_loc && isOffsetWithinRange(offset, (node as any).expression_loc)) {
                    language = 'ts';
                }
            } else if (node.type === EjbAst.Interpolation && isOffsetWithinRange(offset, (node as any).expression_loc)) {
                language = 'ts';
            }
        }

        return language;
    }

    public toVirtualPosition(pos: vscode.Position): vscode.Position | null {
        const offset = this.document.offsetAt(pos);
        const entry = this.tsMap.find(m => isOffsetWithinRange(offset, m.originalLoc));
        if (entry) {
            const virtualOffset = entry.virtualStartOffset + (offset - entry.originalLoc.start.offset);
            const virtualDoc = TextDocument.create('file:///virtual.ts', 'typescript', 1, this.tsContent);
            const pos = virtualDoc.positionAt(virtualOffset);
            return new vscode.Position(pos.line, pos.character);
        }
        return null;
    }

    public toOriginalRange(range: vscode.Range): vscode.Range | null {
        const virtualDoc = TextDocument.create('file:///virtual.ts', 'typescript', 1, this.tsContent);
        const startOffset = virtualDoc.offsetAt({line: range.start.line, character: range.start.character});
        const endOffset = virtualDoc.offsetAt({line: range.end.line, character: range.end.character});

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
    private htmlLanguageService = new HTMLanguageService();
    private tsLanguageService = new TypeScriptLanguageService();
    private ejbLanguageService = new EJBDirectiveLanguageService();

    constructor(private ejbInstance: Ejb<boolean>, private outputChannel: vscode.OutputChannel) {}

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
        const { deputation } = ejbStore.getState();
        if (deputation) {
            this.outputChannel.appendLine(`[HOVER] Triggered for ${doc.uri.fsPath} at ${pos.line}:${pos.character}`);
        }

        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (deputation) {
            this.outputChannel.appendLine(`[HOVER] Language at position: ${lang}`);
        }

        if (lang === 'ejb') {
            return this.ejbLanguageService.doHover(doc, pos);
        }

        if (lang === 'html') {
            return this.htmlLanguageService.doHover(parsedDoc.document, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const virtualDoc = {
                uri: vscode.Uri.parse('file:///virtual.ts'),
                getText: () => parsedDoc.tsContent,
                version: 1,
                lineCount: parsedDoc.tsContent.split('\n').length,
            } as vscode.TextDocument;

            return this.tsLanguageService.doHover(virtualDoc, virtualPos);
        }

        return null;
    }

    public doComplete(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionList | null {
        const { deputation } = ejbStore.getState();
        if (deputation) {
            this.outputChannel.appendLine(`[AUTOCOMPLETE] Triggered for ${doc.uri.fsPath} at ${pos.line}:${pos.character}`);
        }

        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (deputation) {
            this.outputChannel.appendLine(`[AUTOCOMPLETE] Language at position: ${lang}`);
        }

        if (lang === 'ejb') {
            return this.ejbLanguageService.doComplete(doc, pos);
        }

        if (lang === 'html') {
            return this.htmlLanguageService.doComplete(parsedDoc.document, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const virtualDoc = {
                uri: vscode.Uri.parse('file:///virtual.ts'),
                getText: () => parsedDoc.tsContent,
                version: 1,
                lineCount: parsedDoc.tsContent.split('\n').length,
            } as vscode.TextDocument;

            return this.tsLanguageService.doComplete(virtualDoc, virtualPos);
        }

        return null;
    }

    public findDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'html') {
            return this.htmlLanguageService.findDocumentHighlights(parsedDoc.document, pos);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const virtualDoc = {
                uri: vscode.Uri.parse('file:///virtual.ts'),
                getText: () => parsedDoc.tsContent,
                version: 1,
                lineCount: parsedDoc.tsContent.split('\n').length,
            } as vscode.TextDocument;

            return this.tsLanguageService.findDocumentHighlights(virtualDoc, virtualPos);
        }

        return null;
    }

    public findDocumentSymbols(doc: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        const htmlSymbols = this.htmlLanguageService.findDocumentSymbols(parsedDoc.document);
        const tsSymbols = this.tsLanguageService.findDocumentSymbols(parsedDoc.document);

        return [...(htmlSymbols || []), ...(tsSymbols || [])];
    }

    public findDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Definition | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const virtualDoc = {
                uri: vscode.Uri.parse('file:///virtual.ts'),
                getText: () => parsedDoc.tsContent,
                version: 1,
                lineCount: parsedDoc.tsContent.split('\n').length,
            } as vscode.TextDocument;

            return this.tsLanguageService.findDefinition(virtualDoc, virtualPos);
        }

        return null;
    }

    public doValidation(doc: vscode.TextDocument): vscode.Diagnostic[] {
        const parsedDoc = this.getParsedDoc(doc);
        const errors: EjbError[] = parsedDoc.ast.errors;
        const diagnostics: vscode.Diagnostic[] = [];

        for (const error of errors) {
            if (error.loc) {
                const range = new vscode.Range(
                    new vscode.Position(error.loc.start.line - 1, error.loc.start.column - 1),
                    new vscode.Position(error.loc.end.line - 1, error.loc.end.column - 1)
                );
                const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }
}
