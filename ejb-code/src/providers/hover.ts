import * as vscode from 'vscode';
import { ejb_store } from '@/core/state';
import { ejbParser, Ejb, type AstNode, type DirectiveNode, EjbAst, type SubDirectiveNode } from 'ejb';
import type { EnrichedDirective } from '@/types/index';
import { EJB_Language_Service } from '@/languages/service';

export class EJBHoverProvider implements vscode.HoverProvider {

    constructor(
        private output_channel: vscode.OutputChannel,
        private ejb_instance: Ejb<boolean>,
        private language_service: EJB_Language_Service
    ) { }

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const directives = ejb_store.getState().directives;
        if (ejb_store.getState().loading || !directives.length) {
            return undefined;
        }

        return this.language_service.do_hover(document, position) || undefined;
    }
}