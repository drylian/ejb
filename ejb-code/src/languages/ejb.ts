import * as vscode from 'vscode';
import { ejbStore } from '@/core/state';

export class EJBDirectiveLanguageService {
    doHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const { directives } = ejbStore.getState();
        const wordRange = document.getWordRangeAtPosition(position, /@\w+/);
        if (!wordRange || !wordRange.contains(position)) return null;

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
        const line = document.lineAt(position.line).text;
        const prefix = line.substring(0, position.character);

        if (!prefix.trim().endsWith('@')) return null;

        const { directives } = ejbStore.getState();
        const items = directives.map(d => {
            const item = new vscode.CompletionItem(d.name.toString(), vscode.CompletionItemKind.Keyword);
            item.insertText = d.name.toString();
            item.detail = d.sourcePackage;
            item.documentation = new vscode.MarkdownString(d.description);
            return item;
        });

        return new vscode.CompletionList(items, true);
    }
}
