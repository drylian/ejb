
import type { LanguageServiceHost, CompilerOptions, IScriptSnapshot } from "typescript";
import * as ts from "typescript";
import type { LanguageMode, Settings } from "./types";
import { TextDocument, Position, CompletionList, CompletionItem, Hover, Definition, Location, DocumentHighlight, SymbolInformation, SignatureHelp, Diagnostic, WorkspaceEdit, TextEdit, Range } from "vscode-languageserver";
import { get_virtual_js_uri } from "./language_service";

class TypeScriptServiceHost implements LanguageServiceHost {
    private _script_file_names: string[] = [];
    private _script_snapshots = new Map<string, IScriptSnapshot>();
    private _script_versions = new Map<string, string>();
    private compiler_options: CompilerOptions;

    constructor() {
        this.compiler_options = {
            allowNonTsExtensions: true,
            allowJs: true,
            lib: ["lib.esnext.d.ts"],
            target: ts.ScriptTarget.Latest,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.Preserve,
            allowSyntheticDefaultImports: true,
            forceConsistentCasingInFileNames: true,
            strict: true,
            skipLibCheck: true,
            esModuleInterop: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
        };
    }

    public updateDocument(uri: string, content: string, version: number) {
        this._script_file_names = [uri];
        this._script_snapshots.set(uri, ts.ScriptSnapshot.fromString(content));
        this._script_versions.set(uri, version.toString());
    }

    getScriptFileNames(): string[] {
        return this._script_file_names;
    }

    getScriptVersion(file_name: string): string {
        return this._script_versions.get(file_name) || "1";
    }

    getScriptSnapshot(file_name: string): IScriptSnapshot | undefined {
        return this._script_snapshots.get(file_name);
    }

    getCompilationSettings(): CompilerOptions {
        return this.compiler_options;
    }

    getCurrentDirectory(): string {
        return "";
    }

    getDefaultLibFileName(options: CompilerOptions): string {
        return ts.getDefaultLibFilePath(options);
    }

    fileExists(file_name: string): boolean {
        return this._script_snapshots.has(file_name);
    }

    readFile(file_name: string): string | undefined {
        const snapshot = this._script_snapshots.get(file_name);
        return snapshot ? snapshot.getText(0, snapshot.getLength()) : undefined;
    }

    readDirectory(path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number): string[] {
        return [];
    }

    log(s: string): void {
        console.log(s);
    }

    getScriptKind(file_name: string): ts.ScriptKind {
        if (file_name.endsWith(".ts") || file_name.endsWith(".tsx")) {
            return ts.ScriptKind.TS;
        }
        if (file_name.endsWith(".js") || file_name.endsWith(".jsx")) {
            return ts.ScriptKind.JS;
        }
        return ts.ScriptKind.Unknown;
    }
}

export function get_ts_language_mode(): LanguageMode {
    const host = new TypeScriptServiceHost();
    const ts_language_service = ts.createLanguageService(host);

    return {
        getId: () => "typescript",
        doValidation(document: TextDocument, settings?: Settings): Promise<Diagnostic[]> {
            const virtual_uri = get_virtual_js_uri(document.uri).toString();
            host.updateDocument(virtual_uri, document.getText(), document.version);
            const diagnostics = ts_language_service.getSyntacticDiagnostics(virtual_uri).concat(ts_language_service.getSemanticDiagnostics(virtual_uri));
            return Promise.resolve(diagnostics.map(d => {
                const range = Range.create(document.positionAt(d.start!), document.positionAt(d.start! + d.length!));
                return Diagnostic.create(range, `[TS] ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
            }));
        },
        doComplete(document: TextDocument, position: Position, documentContext, settings?: Settings): Promise<CompletionList> {
            const virtual_uri = get_virtual_js_uri(document.uri).toString();
            host.updateDocument(virtual_uri, document.getText(), document.version);
            const offset = document.offsetAt(position);
            const completions = ts_language_service.getCompletionsAtPosition(virtual_uri, offset, {});
            if (!completions) {
                return Promise.resolve(CompletionList.create([]));
            }
            const result: CompletionList = {
                isIncomplete: false,
                items: completions.entries.map(entry => {
                    return {
                        label: entry.name,
                        kind: entry.kind as any,
                        data: {
                            uri: document.uri,
                            offset: offset,
                            entryName: entry.name
                        }
                    };
                })
            };
            return Promise.resolve(result);
        },
        doHover(document: TextDocument, position: Position, settings?: Settings): Promise<Hover | null> {
            const virtual_uri = get_virtual_js_uri(document.uri).toString();
            host.updateDocument(virtual_uri, document.getText(), document.version);
            const offset = document.offsetAt(position);
            const quick_info = ts_language_service.getQuickInfoAtPosition(virtual_uri, offset);
            if (quick_info) {
                const display_parts = ts.displayPartsToString(quick_info.displayParts);
                const documentation = ts.displayPartsToString(quick_info.documentation);
                const contents = [display_parts, documentation].filter(Boolean).join("\n\n");
                const range = Range.create(document.positionAt(quick_info.textSpan.start), document.positionAt(quick_info.textSpan.start + quick_info.textSpan.length));
                return Promise.resolve({ contents, range });
            }
            return Promise.resolve(null);
        },
        findDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
            const virtual_uri = get_virtual_js_uri(document.uri).toString();
            host.updateDocument(virtual_uri, document.getText(), document.version);
            const offset = document.offsetAt(position);
            const definitions = ts_language_service.getDefinitionAtPosition(virtual_uri, offset);
            if (definitions) {
                return Promise.resolve(definitions.map(d => Location.create(d.fileName, Range.create(document.positionAt(d.textSpan.start), document.positionAt(d.textSpan.start + d.textSpan.length)))));
            }
            return Promise.resolve(null);
        },
        findDocumentHighlights(document: TextDocument, position: Position): Promise<DocumentHighlight[]> {
            const virtual_uri = get_virtual_js_uri(document.uri).toString();
            host.updateDocument(virtual_uri, document.getText(), document.version);
            const offset = document.offsetAt(position);
            const highlights = ts_language_service.getDocumentHighlights(virtual_uri, offset, [virtual_uri]);
            if (highlights) {
                return Promise.resolve(highlights.flatMap(h => h.highlightSpans.map(s => DocumentHighlight.create(Range.create(document.positionAt(s.textSpan.start), document.positionAt(s.textSpan.start + s.textSpan.length))))));
            }
            return Promise.resolve([]);
        },
        onDocumentRemoved(document: TextDocument) { },
        dispose() {
            ts_language_service.dispose();
        },
    };
}
