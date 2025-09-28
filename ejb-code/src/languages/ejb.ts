import * as vscode from 'vscode';
import { BaseLanguageService } from './base';
import { ejbStore } from '@/core/state';

export class EJBLanguageService extends BaseLanguageService {
    doHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const { directives } = ejbStore.getState();
        const wordRange = document.getWordRangeAtPosition(position, /@\w+/);
        if (!wordRange) return null;

        const word = document.getText(wordRange);
        const directiveName = word.substring(1);

        const directive = directives.find(d => d.name === directiveName);
        if (!directive) return null;

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(directive.name.toString(), 'ejb');
        markdown.appendMarkdown(`\n---\n`);
        markdown.appendMarkdown(`**Source:** ${directive.sourcePackage}\n`);
        markdown.appendMarkdown(`\n${directive.description}\n`);

        if (directive.example) {
            markdown.appendMarkdown(`\n**Example:**\n`);
            markdown.appendCodeblock(directive.example, 'ejb');
        }

        return new vscode.Hover(markdown, wordRange);
    }

    doComplete(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionList | null {
        const { directives } = ejbStore.getState();
        const line = document.lineAt(position.line).text;
        const prefix = line.substring(0, position.character);

        if (!prefix.endsWith('@')) return null;

        const items = directives.map(d => {
            const item = new vscode.CompletionItem(d.name.toString(), vscode.CompletionItemKind.Keyword);
            item.insertText = d.name.toString();
            return item;
        });

        return new vscode.CompletionList(items, true);
    }

    doValidation(_document: vscode.TextDocument): vscode.Diagnostic[] {
        return [];
    }

    findDefinition(_document: vscode.TextDocument, _position: vscode.Position): vscode.Definition | null {
        return null;
    }

    findDocumentHighlights(_document: vscode.TextDocument, _position: vscode.Position): vscode.DocumentHighlight[] | null {
        return null;
    }

    findDocumentSymbols(_document: vscode.TextDocument): vscode.SymbolInformation[] | null {
        return null;
    }
}
