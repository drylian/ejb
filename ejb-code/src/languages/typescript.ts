import * as vscode from 'vscode';
import * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseLanguageService } from './base';
import type { Position as LspPosition } from 'vscode-languageserver-types';

function toLspPosition(pos: vscode.Position): LspPosition {
    return { line: pos.line, character: pos.character };
}


function toVscodePosition(pos: LspPosition): vscode.Position {
    return new vscode.Position(pos.line, pos.character);
}

export class TypeScriptLanguageService extends BaseLanguageService {
    private tsService: ts.LanguageService;
    private files: Map<string, { text: string, version: string }> = new Map();

    constructor(libContent: string) {
        super();
        const libFileName = 'lib.esnext.d.ts';
        this.files.set(libFileName, { text: libContent, version: '1' });

        const host: ts.LanguageServiceHost = {
            getScriptFileNames: () => Array.from(this.files.keys()),
            getScriptVersion: fileName => this.files.get(fileName)?.version || '0',
            getScriptSnapshot: fileName => {
                const file = this.files.get(fileName);
                return file ? ts.ScriptSnapshot.fromString(file.text) : undefined;
            },
            getCurrentDirectory: () => '',
            getCompilationSettings: () => ({
                allowJs: true,
                target: ts.ScriptTarget.Latest,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
            }),
            getDefaultLibFileName: () => libFileName,
            fileExists: fileName => this.files.has(fileName),
            readFile: fileName => this.files.get(fileName)?.text,
        };

        this.tsService = ts.createLanguageService(host, ts.createDocumentRegistry());
    }

    addFile(document: TextDocument) {
        this.files.set(document.uri, { text: document.getText(), version: document.version.toString() });
    }

    doHover(document: TextDocument, position: vscode.Position): vscode.Hover | null {
        this.addFile(document);
        const offset = document.offsetAt(toLspPosition(position));
        const quickInfo = this.tsService.getQuickInfoAtPosition(document.uri, offset);
        if (!quickInfo) return null;

        const display = ts.displayPartsToString(quickInfo.displayParts);
        const docs = ts.displayPartsToString(quickInfo.documentation);
        const markdown = new vscode.MarkdownString().appendCodeblock(display, 'typescript');
        if (docs) {
            markdown.appendMarkdown(docs);
        }
        
        const range = new vscode.Range(
            toVscodePosition(document.positionAt(quickInfo.textSpan.start)),
            toVscodePosition(document.positionAt(quickInfo.textSpan.start + quickInfo.textSpan.length))
        );

        return new vscode.Hover(markdown, range);
    }

    doComplete(document: TextDocument, position: vscode.Position): vscode.CompletionList | null {
        this.addFile(document);
        const offset = document.offsetAt(toLspPosition(position));
        const completions = this.tsService.getCompletionsAtPosition(document.uri, offset, {});
        if (!completions) return null;

        const completionItems = completions.entries.map(item => {
            const completionItem = new vscode.CompletionItem(item.name, this.convertTsCompletionKind(item.kind));
            return completionItem;
        });

        return new vscode.CompletionList(completionItems, false);
    }

    doValidation(document: TextDocument): vscode.Diagnostic[] {
        this.addFile(document);
        const diagnostics = this.tsService.getSyntacticDiagnostics(document.uri)
            .concat(this.tsService.getSemanticDiagnostics(document.uri));
        
        return diagnostics.map(diag => {
            const start = diag.start || 0;
            const length = diag.length || 0;
            const range = new vscode.Range(
                toVscodePosition(document.positionAt(start)),
                toVscodePosition(document.positionAt(start + length))
            );
            return new vscode.Diagnostic(range, ts.flattenDiagnosticMessageText(diag.messageText, '\n'), vscode.DiagnosticSeverity.Error);
        });
    }
    
    findDefinition(document: TextDocument, position: vscode.Position): vscode.Definition | null {
        this.addFile(document);
        const offset = document.offsetAt(toLspPosition(position));
        const definitions = this.tsService.getDefinitionAtPosition(document.uri, offset);
        if (!definitions) return null;

        return definitions.map(def => {
            const range = new vscode.Range(
                toVscodePosition(document.positionAt(def.textSpan.start)),
                toVscodePosition(document.positionAt(def.textSpan.start + def.textSpan.length))
            );
            return new vscode.Location(vscode.Uri.parse(document.uri), range);
        });
    }

    findDocumentHighlights(document: TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null {
        this.addFile(document);
        const offset = document.offsetAt(toLspPosition(position));
        const highlights = this.tsService.getDocumentHighlights(document.uri, offset, [document.uri]);
        if (!highlights) return null;

        const result: vscode.DocumentHighlight[] = [];
        for (const h of highlights) {
            for (const span of h.highlightSpans) {
                const range = new vscode.Range(
                    toVscodePosition(document.positionAt(span.textSpan.start)),
                    toVscodePosition(document.positionAt(span.textSpan.start + span.textSpan.length))
                );
                result.push(new vscode.DocumentHighlight(range, span.kind === 'writtenReference' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
            }
        }
        return result;
    }

    findDocumentSymbols(document: TextDocument): vscode.SymbolInformation[] | null {
        this.addFile(document);
        const navItems = this.tsService.getNavigationBarItems(document.uri);

        const result: vscode.SymbolInformation[] = [];
        const convert = (items: ts.NavigationBarItem[], containerName?: string) => {
            for (const item of items) {
                const span = item.spans[0];
                const range = new vscode.Range(
                    toVscodePosition(document.positionAt(span.start)),
                    toVscodePosition(document.positionAt(span.start + span.length))
                );
                const symbolInfo = new vscode.SymbolInformation(
                    item.text,
                    this.convertTsSymbolKind(item.kind),
                    containerName || '',
                    new vscode.Location(vscode.Uri.parse(document.uri), range)
                );
                result.push(symbolInfo);
                if (item.childItems) {
                    convert(item.childItems, item.text);
                }
            }
        }
        convert(navItems);
        return result;
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
}