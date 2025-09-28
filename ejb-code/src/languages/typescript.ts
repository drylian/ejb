import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageService } from './base';

export class TypeScriptLanguageService extends BaseLanguageService {
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

    doHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const service = this.createTsLanguageService(document, document.getText());
        const quickInfo = service.getQuickInfoAtPosition(document.uri.toString() + '.ts', document.offsetAt(position));
        if (!quickInfo) return null;

        const display = ts.displayPartsToString(quickInfo.displayParts);
        const docs = ts.displayPartsToString(quickInfo.documentation);

        return new vscode.Hover(new vscode.MarkdownString([display, docs].filter(Boolean).join('\n\n')));
    }

    doComplete(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionList | null {
        const service = this.createTsLanguageService(document, document.getText());
        const completions = service.getCompletionsAtPosition(document.uri.toString() + '.ts', document.offsetAt(position), {});
        if (!completions) return null;

        const completionItems = completions.entries.map(item => {
            const completionItem = new vscode.CompletionItem(item.name, this.convertTsCompletionKind(item.kind));
            return completionItem;
        });

        return new vscode.CompletionList(completionItems, false);
    }

    doValidation(_document: vscode.TextDocument): vscode.Diagnostic[] {
        return [];
    }

    findDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition | null {
        const service = this.createTsLanguageService(document, document.getText());
        const definitions = service.getDefinitionAtPosition(document.uri.toString() + '.ts', document.offsetAt(position));
        if (!definitions) return null;

        const result: vscode.Location[] = [];
        for (const def of definitions) {
            const virtualDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() + '.ts' === def.fileName);
            if (!virtualDoc) continue;

            const start = virtualDoc.positionAt(def.textSpan.start);
            const end = virtualDoc.positionAt(def.textSpan.start + def.textSpan.length);
            result.push(new vscode.Location(vscode.Uri.parse(def.fileName), new vscode.Range(start, end)));
        }
        return result;
    }

    findDocumentHighlights(document: vscode.TextDocument, position: vscode.Position): vscode.DocumentHighlight[] | null {
        const service = this.createTsLanguageService(document, document.getText());
        const highlights = service.getDocumentHighlights(document.uri.toString() + '.ts', document.offsetAt(position), [document.uri.toString() + '.ts']);
        if (!highlights) return null;

        const result: vscode.DocumentHighlight[] = [];
        for (const h of highlights) {
            for (const span of h.highlightSpans) {
                const virtualDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() + '.ts' === h.fileName);
                if (!virtualDoc) continue;

                const start = virtualDoc.positionAt(span.textSpan.start);
                const end = virtualDoc.positionAt(span.textSpan.start + span.textSpan.length);
                result.push(new vscode.DocumentHighlight(new vscode.Range(start, end), span.kind === 'writtenReference' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
            }
        }
        return result;
    }

    findDocumentSymbols(_document: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const service = this.createTsLanguageService(_document, _document.getText());
        const navItems = service.getNavigationBarItems(_document.uri.toString() + '.ts');

        const result: vscode.SymbolInformation[] = [];
        const convertTsNavItems = (items: ts.NavigationBarItem[], containerName?: string) => {
            if (!items) return;
            for (const item of items) {
                const span = item.spans[0];
                const virtualDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() + '.ts' === _document.uri.toString() + '.ts');
                if (!virtualDoc) continue;

                const start = virtualDoc.positionAt(span.start);
                const end = virtualDoc.positionAt(span.start + span.length);
                const symbolInfo = new vscode.SymbolInformation(
                    item.text,
                    this.convertTsSymbolKind(item.kind),
                    containerName || '',
                    new vscode.Location(virtualDoc.uri, new vscode.Range(start, end))
                );
                result.push(symbolInfo);
                if (item.childItems) {
                    convertTsNavItems(item.childItems, item.text);
                }
            }
        }
        convertTsNavItems(navItems);

        return result;
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
}
