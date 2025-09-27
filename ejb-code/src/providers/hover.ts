import * as vscode from 'vscode';
import { ejbStore } from '@/core/state';
import { EJBLanguageService } from '@/languages/service';

export class EJBHoverProvider implements vscode.HoverProvider {

    constructor(
        private languageService: EJBLanguageService
    ) { }

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const directives = ejbStore.getState().directives;
        if (ejbStore.getState().loading || !directives.length) {
            return undefined;
        }

        return this.languageService.doHover(document, position) || undefined;
    }
}
