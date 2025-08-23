import * as vscode from 'vscode';
import { EJBConfigManager } from './EJBConfigManager';

export class EJBHoverProvider implements vscode.HoverProvider {
    constructor(private configManager: EJBConfigManager) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Verificar cancelamento imediatamente
        if (token.isCancellationRequested) {
            return null;
        }

        // Get word at position with custom regex for directives
        const range = document.getWordRangeAtPosition(position, /@?[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!range) return null;

        const word = document.getText(range);
        let directiveName = word;

        // Remove @ if present
        if (directiveName.startsWith('@')) {
            directiveName = directiveName.substring(1);
        } else {
            // Check if @ is just before the word
            const charBefore = range.start.character > 0 ? 
                document.getText(new vscode.Range(
                    range.start.translate(0, -1), 
                    range.start
                )) : '';
            
            if (charBefore !== '@') {
                return null;
            }
        }

        // Verificar cancelamento novamente
        if (token.isCancellationRequested) {
            return null;
        }

        const directive = this.configManager.getDirective(directiveName);
        if (!directive) return null;

        const markdown = new vscode.MarkdownString('', true);
        markdown.appendCodeblock(`@${directive.name}`, 'ejb');
        markdown.appendMarkdown(`
${directive.description}

`);

        if (directive.params?.length) {
            markdown.appendMarkdown('**Parameters:**\n\n');
            for (const param of directive.params) {
                markdown.appendMarkdown(`- **${param.name}** — *${param.type}*\n`);
            }
            markdown.appendMarkdown('\n');
        }

        if (directive.parents?.length) {
            markdown.appendMarkdown(`**Related:**\n\n`);
            for (const parent of directive.parents) {
                const desc = parent.description ? ` — ${parent.description}` : '';
                markdown.appendMarkdown(`- **${parent.name}**${desc}\n`);
            }
            markdown.appendMarkdown('\n');
        }

        if (directive.children) {
            const contentType = directive.children_type ? ` (${directive.children_type})` : '';
            markdown.appendMarkdown(`**Requires:** \`@end\` closing tag${contentType}\n`);
        }

        // Verificar cancelamento final
        if (token.isCancellationRequested) {
            return null;
        }

        return new vscode.Hover(markdown, range);
    }
}