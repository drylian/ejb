import * as vscode from 'vscode';
import { getLanguageService as getHTMLLanguageService, TextDocument as HTMLTextDocument } from 'vscode-html-languageservice';
import * as ts from 'typescript';
import { Ejb, ejbParser, type AstNode, type RootNode, EjbAst, type DirectiveNode, type InterpolationNode, type SourceLocation } from 'ejb';
import type { ProcessedEJB, SourceMapEntry } from '@/types/index';

function is_offset_within_range(offset: number, range: { start: { offset: number; }; end: { offset: number; }; }) {
    return offset >= range.start.offset && offset <= range.end.offset;
}

class ParsedEJB_Document {
    public version: number;
    private text: string;
    private ast: RootNode;
    private ejb_instance: Ejb<boolean>;

    public html_content: string = '';
    public ts_content: string = '';
    private ts_map: SourceMapEntry[] = [];

    constructor(private document: vscode.TextDocument, ejb_instance: Ejb<boolean>) {
        this.version = document.version;
        this.text = document.getText();
        this.ejb_instance = ejb_instance;
        this.ast = ejbParser(this.ejb_instance, this.text);
        this.parse();
    }

    private parse() {
        let html = this.text;
        let ts = '';
        const ts_map: SourceMapEntry[] = [];

        const walk = (node: AstNode) => {
            if (!node.loc) return;

            if (node.type === EjbAst.Directive || node.type === EjbAst.Interpolation) {
                const start = node.loc.start.offset;
                const end = node.loc.end.offset;
                html = html.substring(0, start) + ' '.repeat(end - start) + html.substring(end);
            }

            let expression: string | undefined;
            let expression_loc: SourceLocation | undefined;

            if (node.type === EjbAst.Directive) {
                const directive = node as DirectiveNode;
                const def = this.ejb_instance.directives[directive.name];

                if (directive.expression) {
                    expression = directive.expression;
                    expression_loc = (node as any).expression_loc || node.loc;
                }

                if (def?.children_type === 'js' && directive.children.length > 0) {
                    const startNode = directive.children[0];
                    const endNode = directive.children[directive.children.length - 1];
                    if (startNode.loc && endNode.loc) {
                        const content = this.text.substring(startNode.loc.start.offset, endNode.loc.end.offset);
                        const loc: SourceLocation = { start: startNode.loc.start, end: endNode.loc.end };
                        ts_map.push({ original_loc: loc, virtual_start_offset: ts.length, virtual_end_offset: ts.length + content.length });
                        ts += content + '\n';
                    }
                }
            } else if (node.type === EjbAst.Interpolation) {
                expression = (node as InterpolationNode).expression;
                expression_loc = (node as any).expression_loc || node.loc;
            }

            if (expression && expression_loc) {
                const content = `(${expression});`;
                ts_map.push({ original_loc: expression_loc, virtual_start_offset: ts.length, virtual_end_offset: ts.length + content.length });
                ts += content + '\n';
            }

            if ('children' in node) {
                node.children.forEach(walk);
            }
        };

        walk(this.ast);

        this.html_content = html;
        this.ts_content = ts;
        this.ts_map = ts_map;
    }

    public get_language_at(position: vscode.Position): 'html' | 'ts' {
        const offset = this.document.offsetAt(position);
        let language: 'html' | 'ts' = 'html';

        const find_node = (node: AstNode): AstNode | null => {
            if (!node.loc || !is_offset_within_range(offset, node.loc)) return null;

            if ('children' in node) {
                for (const child of node.children) {
                    const found = find_node(child);
                    if (found) return found;
                }
            }
            return node;
        };

        const node = find_node(this.ast);

        if (node) {
            if (node.type === EjbAst.Directive) {
                const def = this.ejb_instance.directives[(node as DirectiveNode).name];
                if (def?.children_type === 'js' && is_offset_within_range(offset, (node as any).children_range)) {
                    language = 'ts';
                }
                if ((node as any).expression_loc && is_offset_within_range(offset, (node as any).expression_loc)) {
                    language = 'ts';
                }
            } else if (node.type === EjbAst.Interpolation && is_offset_within_range(offset, (node as any).expression_loc)) {
                language = 'ts';
            }
        }

        return language;
    }

    public to_virtual_position(pos: vscode.Position): vscode.Position | null {
        const offset = this.document.offsetAt(pos);
        const entry = this.ts_map.find(m => is_offset_within_range(offset, m.original_loc));
        if (entry) {
            const virtual_offset = entry.virtual_start_offset + (offset - entry.original_loc.start.offset);
            const virtual_doc = HTMLTextDocument.create('', 'javascript', 0, this.ts_content);
            return virtual_doc.positionAt(virtual_offset);
        }
        return null;
    }

    public to_original_range(range: vscode.Range): vscode.Range | null {
        const virtual_doc = HTMLTextDocument.create('', 'javascript', 0, this.ts_content);
        const start_offset = virtual_doc.offsetAt(range.start);
        const end_offset = virtual_doc.offsetAt(range.end);

        const entry = this.ts_map.find(m => start_offset >= m.virtual_start_offset && end_offset <= m.virtual_end_offset);
        if (entry) {
            const original_start_offset = entry.original_loc.start.offset + (start_offset - entry.virtual_start_offset);
            const original_end_offset = entry.original_loc.start.offset + (end_offset - entry.virtual_start_offset);
            return new vscode.Range(
                this.document.positionAt(original_start_offset),
                this.document.positionAt(original_end_offset)
            );
        }
        return null;
    }
}

export class EJB_Language_Service {
    private doc_cache = new Map<string, ParsedEJB_Document>();
    private html_service = getHTMLLanguageService();
    private ts_service: ts.LanguageService;
    private ts_host: ts.LanguageServiceHost;

    constructor(private ejb_instance: Ejb<boolean>) {
        this.ts_host = this.create_ts_host();
        this.ts_service = ts.createLanguageService(this.ts_host, ts.createDocumentRegistry());
    }

    private get_parsed_doc(doc: vscode.TextDocument): ParsedEJB_Document {
        const cached = this.doc_cache.get(doc.uri.toString());
        if (cached && cached.version === doc.version) {
            return cached;
        }
        const parsed = new ParsedEJB_Document(doc, this.ejb_instance);
        this.doc_cache.set(doc.uri.toString(), parsed);
        return parsed;
    }

    private create_ts_host(): ts.LanguageServiceHost {
        const file_map = new Map<string, { text: string, version: string }>();

        const host: ts.LanguageServiceHost = {
            getScriptFileNames: () => Array.from(file_map.keys()),
            getScriptVersion: fileName => file_map.get(fileName)?.version || '0',
            getScriptSnapshot: fileName => {
                const file = file_map.get(fileName);
                return file ? ts.ScriptSnapshot.fromString(file.text) : undefined;
            },
            getCurrentDirectory: () => '',
            getCompilationSettings: () => ({ allowJs: true, target: ts.ScriptTarget.Latest }),
            getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
            fileExists: fileName => file_map.has(fileName),
            readFile: fileName => file_map.get(fileName)?.text,
        };

        host.update_document = (doc: vscode.TextDocument, content: string) => {
            file_map.set(doc.uri.toString() + '.ts', { text: content, version: doc.version.toString() });
        };

        return host;
    }

    public do_hover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
        const parsed_doc = this.get_parsed_doc(doc);
        const lang = parsed_doc.get_language_at(pos);

        if (lang === 'html') {
            const html_doc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsed_doc.html_content);
            return this.html_service.doHover(html_doc, pos, this.html_service.parseHTMLDocument(html_doc));
        }

        if (lang === 'ts') {
            const virtual_pos = parsed_doc.to_virtual_position(pos);
            if (!virtual_pos) return null;

            (this.ts_host as any).update_document(doc, parsed_doc.ts_content);
            const virtual_doc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsed_doc.ts_content);
            const virtual_offset = virtual_doc.offsetAt(virtual_pos);

            const quick_info = this.ts_service.getQuickInfoAtPosition(doc.uri.toString() + '.ts', virtual_offset);
            if (!quick_info) return null;

            const display = ts.displayPartsToString(quick_info.displayParts);
            const docs = ts.displayPartsToString(quick_info.documentation);

            const virtual_range = new vscode.Range(virtual_doc.positionAt(quick_info.textSpan.start), virtual_doc.positionAt(quick_info.textSpan.start + quick_info.textSpan.length));
            const range = parsed_doc.to_original_range(virtual_range);

            return new vscode.Hover(new vscode.MarkdownString([display, docs].filter(Boolean).join('\n\n')), range || undefined);
        }

        return null;
    }

    public do_complete(doc: vscode.TextDocument, pos: vscode.Position, context: vscode.CompletionContext): vscode.CompletionList | null {
        const parsed_doc = this.get_parsed_doc(doc);
        const lang = parsed_doc.get_language_at(pos);

        if (lang === 'html') {
            const html_doc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsed_doc.html_content);
            return this.html_service.doComplete(html_doc, pos, this.html_service.parseHTMLDocument(html_doc));
        }

        if (lang === 'ts') {
            const virtual_pos = parsed_doc.to_virtual_position(pos);
            if (!virtual_pos) return null;

            (this.ts_host as any).update_document(doc, parsed_doc.ts_content);
            const virtual_doc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsed_doc.ts_content);
            const virtual_offset = virtual_doc.offsetAt(virtual_pos);

            const completions = this.ts_service.getCompletionsAtPosition(doc.uri.toString() + '.ts', virtual_offset, {});
            if (!completions) return null;

            return {
                isIncomplete: false,
                items: completions.entries.map(item => ({
                    label: item.name,
                    kind: item.kind as any,
                }))
            };
        }

        return null;
    }

    public find_document_highlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | null {
        const parsed_doc = this.get_parsed_doc(doc);
        const lang = parsed_doc.get_language_at(pos);

        if (lang === 'html') {
            const html_doc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsed_doc.html_content);
            return this.html_service.findDocumentHighlights(html_doc, pos, this.html_service.parseHTMLDocument(html_doc));
        }

        if (lang === 'ts') {
            const virtual_pos = parsed_doc.to_virtual_position(pos);
            if (!virtual_pos) return null;

            (this.ts_host as any).update_document(doc, parsed_doc.ts_content);
            const virtual_doc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsed_doc.ts_content);
            const virtual_offset = virtual_doc.offsetAt(virtual_pos);

            const highlights = this.ts_service.getDocumentHighlights(doc.uri.toString() + '.ts', virtual_offset, [doc.uri.toString() + '.ts']);
            if (!highlights) return null;

            const result: vscode.DocumentHighlight[] = [];
            for (const h of highlights) {
                for (const span of h.highlightSpans) {
                    const virtual_range = new vscode.Range(virtual_doc.positionAt(span.textSpan.start), virtual_doc.positionAt(span.textSpan.start + span.textSpan.length));
                    const original_range = parsed_doc.to_original_range(virtual_range);
                    if (original_range) {
                        result.push(new vscode.DocumentHighlight(original_range, span.kind === 'writtenReference' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
                    }
                }
            }
            return result;
        }

        return null;
    }

    public find_document_symbols(doc: vscode.TextDocument): vscode.SymbolInformation[] | null {
        const parsed_doc = this.get_parsed_doc(doc);
        
        const html_doc = HTMLTextDocument.create(doc.uri.toString(), 'html', doc.version, parsed_doc.html_content);
        const html_symbols = this.html_service.findDocumentSymbols(html_doc, this.html_service.parseHTMLDocument(html_doc));

        (this.ts_host as any).update_document(doc, parsed_doc.ts_content);
        const virtual_doc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsed_doc.ts_content);
        const ts_nav_items = this.ts_service.getNavigationBarItems(doc.uri.toString() + '.ts');

        const ts_symbols_converted: vscode.SymbolInformation[] = [];
        const convert_ts_nav_items = (items: ts.NavigationBarItem[], containerName?: string) => {
            if (!items) return;
            for (const item of items) {
                const span = item.spans[0];
                const virtual_range = new vscode.Range(virtual_doc.positionAt(span.start), virtual_doc.positionAt(span.start + span.length));
                const range = parsed_doc.to_original_range(virtual_range);

                if (range) {
                    const symbol_info = new vscode.SymbolInformation(
                        item.text,
                        this.convert_ts_symbol_kind(item.kind),
                        containerName || '',
                        new vscode.Location(doc.uri, range)
                    );
                    ts_symbols_converted.push(symbol_info);
                    if (item.childItems) {
                        convert_ts_nav_items(item.childItems, item.text);
                    }
                }
            }
        }
        convert_ts_nav_items(ts_nav_items);

        return [...html_symbols, ...ts_symbols_converted];
    }

    private convert_ts_symbol_kind(kind: ts.ScriptElementKind): vscode.SymbolKind {
        switch (kind) {
            case 'module': return vscode.SymbolKind.Module;
            case 'class': return vscode.SymbolKind.Class;
            case 'interface': return vscode.SymbolKind.Interface;
            case 'method': return vscode.SymbolKind.Method;
            case 'memberVariable': return vscode.SymbolKind.Field;
            case 'memberGetAccessor': return vscode.SymbolKind.Property;
            case 'memberSetAccessor': return vscode.SymbolKind.Property;
            case 'variable': return vscode.SymbolKind.Variable;
            case 'const': return vscode.SymbolKind.Constant;
            case 'localVariable': return vscode.SymbolKind.Variable;
            case 'function': return vscode.SymbolKind.Function;
            case 'localFunction': return vscode.SymbolKind.Function;
            case 'enum': return vscode.SymbolKind.Enum;
            case 'enumMember': return vscode.SymbolKind.EnumMember;
            case 'alias': return vscode.SymbolKind.Variable;
            default: return vscode.SymbolKind.Variable;
        }
    }

    public find_definition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Definition | null {
        const parsed_doc = this.get_parsed_doc(doc);
        const lang = parsed_doc.get_language_at(pos);

        if (lang === 'ts') {
            const virtual_pos = parsed_doc.to_virtual_position(pos);
            if (!virtual_pos) return null;

            (this.ts_host as any).update_document(doc, parsed_doc.ts_content);
            const virtual_doc = HTMLTextDocument.create(doc.uri.toString() + '.ts', 'javascript', doc.version, parsed_doc.ts_content);
            const virtual_offset = virtual_doc.offsetAt(virtual_pos);

            const definitions = this.ts_service.getDefinitionAtPosition(doc.uri.toString() + '.ts', virtual_offset);
            if (!definitions) return null;

            const result: vscode.Location[] = [];
            for (const def of definitions) {
                const virtual_range = new vscode.Range(virtual_doc.positionAt(def.textSpan.start), virtual_doc.positionAt(def.textSpan.start + def.textSpan.length));
                const original_range = parsed_doc.to_original_range(virtual_range);
                if (original_range) {
                    result.push(new vscode.Location(doc.uri, original_range));
                }
            }
            return result;
        }

        return null;
    }
}
