import * as vscode from 'vscode';
import { getLanguageService as getHTMLLanguageService, TextDocument as HTMLTextDocument } from 'vscode-html-languageservice';
import * as ts from 'typescript';
import { Ejb, ejbParser, type AstNode, type RootNode, EjbAst, type DirectiveNode, type InterpolationNode, type SourceLocation, type EjbError } from 'ejb';
import type { SourceMapEntry } from '@/types/index';
import { ejbStore } from '@/core/state';

function isOffsetWithinRange(offset: number, range: { start: { offset: number; }; end: { offset: number; }; }) {
    return offset >= range.start.offset && offset <= range.end.offset;
}

class ParsedEJBDocument {
    public version: number;
    private text: string;
    public ast: RootNode;
    private ejbInstance: Ejb<boolean>;

    public htmlContent: string = '';
    public tsContent: string = '';
    private tsMap: SourceMapEntry[] = [];

    constructor(private document: vscode.TextDocument, ejbInstance: Ejb<boolean>) {
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

    public getLanguageAt(position: vscode.Position): 'html' | 'ts' {
        const offset = this.document.offsetAt(position);
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
            const virtualDoc = HTMLTextDocument.create('', 'javascript', 0, this.tsContent);
            const pos = virtualDoc.positionAt(virtualOffset);
            return new vscode.Position(pos.line, pos.character);
        }
        return null;
    }

    public toOriginalRange(range: vscode.Range): vscode.Range | null {
        const virtualDoc = HTMLTextDocument.create('', 'javascript', 0, this.tsContent);
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
    private htmlService = getHTMLLanguageService();

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

    private createTsLanguageService(doc: vscode.TextDocument, content: string): ts.LanguageService {
        const fileMap = new Map<string, { text: string, version: string }>();
        fileMap.set(doc.uri.toString() + '.ts', { text: content, version: doc.version.toString() });

        const host: ts.LanguageServiceHost = {
            getScriptFileNames: () => Array.from(fileMap.keys()),
            getScriptVersion: fileName => fileMap.get(fileName)?.version || '0',
            getScriptSnapshot: fileName => {
                const file = fileMap.get(fileName);
                return file ? ts.ScriptSnapshot.fromString(file.text) : undefined;
            },
            getCurrentDirectory: () => '',
            getCompilationSettings: () => ({ allowJs: true, target: ts.ScriptTarget.Latest }),
            getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => fileMap.get(fileName)?.text,
        };

        return ts.createLanguageService(host, ts.createDocumentRegistry());
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

        if (lang === 'html') {
            const htmlDoc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsedDoc.htmlContent);
            const hover = this.htmlService.doHover(htmlDoc, pos, this.htmlService.parseHTMLDocument(htmlDoc));
            if (!hover) return null;
            return new vscode.Hover(hover.contents as any, hover.range ? new vscode.Range(hover.range.start.line, hover.range.start.character, hover.range.end.line, hover.range.end.character) : undefined);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const service = this.createTsLanguageService(doc, parsedDoc.tsContent);
            const virtualDoc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsedDoc.tsContent);
            const virtualOffset = virtualDoc.offsetAt({line: virtualPos.line, character: virtualPos.character});

            const quickInfo = service.getQuickInfoAtPosition(doc.uri.toString() + '.ts', virtualOffset);
            if (!quickInfo) return null;

            const display = ts.displayPartsToString(quickInfo.displayParts);
            const docs = ts.displayPartsToString(quickInfo.documentation);

            const startPos = virtualDoc.positionAt(quickInfo.textSpan.start);
            const endPos = virtualDoc.positionAt(quickInfo.textSpan.start + quickInfo.textSpan.length);
            const virtualRange = new vscode.Range(new vscode.Position(startPos.line, startPos.character), new vscode.Position(endPos.line, endPos.character));
            const range = parsedDoc.toOriginalRange(virtualRange);

            return new vscode.Hover(new vscode.MarkdownString([display, docs].filter(Boolean).join('\n\n')), range || undefined);
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

        if (lang === 'html') {
            const htmlDoc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsedDoc.htmlContent);
            const completions = this.htmlService.doComplete(htmlDoc, pos, this.htmlService.parseHTMLDocument(htmlDoc));
            return new vscode.CompletionList(completions.items.map(i => new vscode.CompletionItem(i.label, this.convertHtmlCompletionKind(i.kind))), completions.isIncomplete);
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const service = this.createTsLanguageService(doc, parsedDoc.tsContent);
            const virtualDoc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsedDoc.tsContent);
            const virtualOffset = virtualDoc.offsetAt({line: virtualPos.line, character: virtualPos.character});

            const completions = service.getCompletionsAtPosition(doc.uri.toString() + '.ts', virtualOffset, {});
            if (!completions) return null;

            const completionItems = completions.entries.map(item => {
                const completionItem = new vscode.CompletionItem(item.name, this.convertTsCompletionKind(item.kind));
                return completionItem;
            });

            return new vscode.CompletionList(completionItems, false);
        }

        return null;
    }

    public findDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'html') {
            const htmlDoc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsedDoc.htmlContent);
            const highlights = this.htmlService.findDocumentHighlights(htmlDoc, pos, this.htmlService.parseHTMLDocument(htmlDoc));
            return highlights.map(h => new vscode.DocumentHighlight(new vscode.Range(h.range.start.line, h.range.start.character, h.range.end.line, h.range.end.character), h.kind as vscode.DocumentHighlightKind));
        }

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const service = this.createTsLanguageService(doc, parsedDoc.tsContent);
            const virtualDoc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsedDoc.tsContent);
            const virtualOffset = virtualDoc.offsetAt({line: virtualPos.line, character: virtualPos.character});

            const highlights = service.getDocumentHighlights(doc.uri.toString() + '.ts', virtualOffset, [doc.uri.toString() + '.ts']);
            if (!highlights) return null;

            const result: vscode.DocumentHighlight[] = [];
            for (const h of highlights) {
                for (const span of h.highlightSpans) {
                    const startPos = virtualDoc.positionAt(span.textSpan.start);
                    const endPos = virtualDoc.positionAt(span.textSpan.start + span.textSpan.length);
                    const virtualRange = new vscode.Range(new vscode.Position(startPos.line, startPos.character), new vscode.Position(endPos.line, endPos.character));
                    const originalRange = parsedDoc.toOriginalRange(virtualRange);
                    if (originalRange) {
                        result.push(new vscode.DocumentHighlight(originalRange, span.kind === 'writtenReference' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
                    }
                }
            }
            return result;
        }

        return null;
    }

    public findDocumentSymbols(doc: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const parsedDoc = this.getParsedDoc(doc);
        
        const htmlDoc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsedDoc.htmlContent);
        const htmlSymbols = this.htmlService.findDocumentSymbols(htmlDoc, this.htmlService.parseHTMLDocument(htmlDoc));

        const service = this.createTsLanguageService(doc, parsedDoc.tsContent);
        const virtualDoc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsedDoc.tsContent);
        const tsNavItems = service.getNavigationBarItems(doc.uri.toString() + '.ts');

        const tsSymbolsConverted: vscode.SymbolInformation[] = [];
        const convertTsNavItems = (items: ts.NavigationBarItem[], containerName?: string) => {
            if (!items) return;
            for (const item of items) {
                const span = item.spans[0];
                const startPos = virtualDoc.positionAt(span.start);
                const endPos = virtualDoc.positionAt(span.start + span.length);
                const virtualRange = new vscode.Range(new vscode.Position(startPos.line, startPos.character), new vscode.Position(endPos.line, endPos.character));
                const range = parsedDoc.toOriginalRange(virtualRange);

                if (range) {
                    const symbolInfo = new vscode.SymbolInformation(
                        item.text,
                        this.convertTsSymbolKind(item.kind),
                        containerName || '',
                        new vscode.Location(doc.uri, range)
                    );
                    tsSymbolsConverted.push(symbolInfo);
                    if (item.childItems) {
                        convertTsNavItems(item.childItems, item.text);
                    }
                }
            }
        }
        convertTsNavItems(tsNavItems);

        const htmlVscodeSymbols = htmlSymbols.map(s => new vscode.SymbolInformation(s.name, s.kind as vscode.SymbolKind, s.containerName || '', new vscode.Location(doc.uri, new vscode.Range(s.location.range.start.line, s.location.range.start.character, s.location.range.end.line, s.location.range.end.character))));

        return [...htmlVscodeSymbols, ...tsSymbolsConverted];
    }

    private convertTsSymbolKind(kind: ts.ScriptElementKind): vscode.SymbolKind {
        switch (kind) {
            case ts.ScriptElementKind.moduleElement: return vscode.SymbolKind.Module;
            case ts.ScriptElementKind.classElement: return vscode.SymbolKind.Class;
            case ts.ScriptElementKind.interfaceElement: return vscode.SymbolKind.Interface;
            case ts.ScriptElementKind.memberFunctionElement: return vscode.SymbolKind.Method;
            case ts.ScriptElementKind.memberVariableElement: return vscode.SymbolKind.Field;
            case ts.ScriptElementKind.memberGetAccessorElement: return vscode.SymbolKind.Property;
            case ts.ScriptElementKind.memberSetAccessorElement: return vscode.SymbolKind.Property;
            case ts.ScriptElementKind.variableElement: return vscode.SymbolKind.Variable;
            case ts.ScriptElementKind.constElement: return vscode.SymbolKind.Constant;
            case ts.ScriptElementKind.localVariableElement: return vscode.SymbolKind.Variable;
            case ts.ScriptElementKind.functionElement: return vscode.SymbolKind.Function;
            case ts.ScriptElementKind.localFunctionElement: return vscode.SymbolKind.Function;
            case ts.ScriptElementKind.enumElement: return vscode.SymbolKind.Enum;
            case ts.ScriptElementKind.enumMemberElement: return vscode.SymbolKind.EnumMember;
            case ts.ScriptElementKind.alias: return vscode.SymbolKind.Variable;
            default: return vscode.SymbolKind.Variable;
        }
    }

    private convertHtmlCompletionKind(kind: number | undefined): vscode.CompletionItemKind {
        if (typeof kind !== 'number') return vscode.CompletionItemKind.Text;
        return kind - 1;
    }

    private convertTsCompletionKind(kind: ts.ScriptElementKind): vscode.CompletionItemKind {
        switch (kind) {
            case ts.ScriptElementKind.moduleElement: return vscode.CompletionItemKind.Module;
            case ts.ScriptElementKind.classElement: return vscode.CompletionItemKind.Class;
            case ts.ScriptElementKind.interfaceElement: return vscode.CompletionItemKind.Interface;
            case ts.ScriptElementKind.memberFunctionElement: return vscode.CompletionItemKind.Method;
            case ts.ScriptElementKind.memberVariableElement: return vscode.CompletionItemKind.Field;
            case ts.ScriptElementKind.memberGetAccessorElement: return vscode.CompletionItemKind.Property;
            case ts.ScriptElementKind.memberSetAccessorElement: return vscode.CompletionItemKind.Property;
            case ts.ScriptElementKind.variableElement: return vscode.CompletionItemKind.Variable;
            case ts.ScriptElementKind.constElement: return vscode.CompletionItemKind.Constant;
            case ts.ScriptElementKind.localVariableElement: return vscode.CompletionItemKind.Variable;
            case ts.ScriptElementKind.functionElement: return vscode.CompletionItemKind.Function;
            case ts.ScriptElementKind.localFunctionElement: return vscode.CompletionItemKind.Function;
            case ts.ScriptElementKind.enumElement: return vscode.CompletionItemKind.Enum;
            case ts.ScriptElementKind.enumMemberElement: return vscode.CompletionItemKind.EnumMember;
            case ts.ScriptElementKind.alias: return vscode.CompletionItemKind.Variable;
            default: return vscode.CompletionItemKind.Text;
        }
    }

    public findDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Definition | null {
        const parsedDoc = this.getParsedDoc(doc);
        const lang = parsedDoc.getLanguageAt(pos);

        if (lang === 'ts') {
            const virtualPos = parsedDoc.toVirtualPosition(pos);
            if (!virtualPos) return null;

            const service = this.createTsLanguageService(doc, parsedDoc.tsContent);
            const virtualDoc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsedDoc.tsContent);
            const virtualOffset = virtualDoc.offsetAt({line: virtualPos.line, character: virtualPos.character});

            const definitions = service.getDefinitionAtPosition(doc.uri.toString() + '.ts', virtualOffset);
            if (!definitions) return null;

            const result: vscode.Location[] = [];
            for (const def of definitions) {
                const startPos = virtualDoc.positionAt(def.textSpan.start);
                const endPos = virtualDoc.positionAt(def.textSpan.start + def.textSpan.length);
                const virtualRange = new vscode.Range(new vscode.Position(startPos.line, startPos.character), new vscode.Position(endPos.line, endPos.character));
                const originalRange = parsedDoc.toOriginalRange(virtualRange);
                if (originalRange) {
                    result.push(new vscode.Location(doc.uri, originalRange));
                }
            }
            return result;
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
