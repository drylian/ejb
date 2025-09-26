import * as vscode from 'vscode';
import { getLanguageService as getHTMLLanguageService, TextDocument as HTMLTextDocument } from 'vscode-html-languageservice';
import * as ts from 'typescript';
import { Ejb, ejbParser, type AstNode, type RootNode, EjbAst, type DirectiveNode, type InterpolationNode, type SourceLocation } from 'ejb';
import type { LanguageMode, LanguageModes, ProcessedEJB, SourceMapEntry } from '@/types/index';

function is_offset_within_range(offset: number, range: { start: { offset: number; }; end: { offset: number; }; }) {
    return offset >= range.start.offset && offset <= range.end.offset;
}

class ParsedEJB_Document {
    public version: number;
    private text: string;
    private ast: RootNode;

    public html_content: string = '';
    public ts_content: string = '';
    private ts_map: SourceMapEntry[] = [];

    constructor(private document: vscode.TextDocument, ejb_instance: Ejb<boolean>) {
        this.version = document.version;
        this.text = document.getText();
        this.ast = ejbParser(ejb_instance, this.text);
        this.parse(ejb_instance);
    }

    private parse(ejb_instance: Ejb<boolean>) {
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
                const def = ejb_instance.directives[directive.name];

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
                const def = (this.ast as any).directives[node.name];
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
            const quick_info = this.ts_service.getQuickInfoAtPosition(doc.uri.toString() + '.ts', doc.offsetAt(virtual_pos));
            if (!quick_info) return null;

            const display = ts.displayPartsToString(quick_info.displayParts);
            const docs = ts.displayPartsToString(quick_info.documentation);
            const range = parsed_doc.to_original_range(new vscode.Range(doc.positionAt(quick_info.textSpan.start), doc.positionAt(quick_info.textSpan.start + quick_info.textSpan.length)));

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
            const completions = this.ts_service.getCompletionsAtPosition(doc.uri.toString() + '.ts', doc.offsetAt(virtual_pos), {});
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
}
