import { ejbStore } from '@/core/state';
import { Ejb, type EjbDirectivePlugin, type EjbDirectiveParent } from 'ejb';
import type * as vscode from 'vscode';

export const createEJB = (outputChannel: vscode.OutputChannel) => {
    const ejb = new Ejb();
    const { directives, deputation } = ejbStore.getState();
    
    if (deputation) {
        outputChannel.appendLine('[EJB-CORE] Deputation mode enabled.');
    }

    const virtualDirectives: Record<string, EjbDirectivePlugin> = {};

    for (const enrichedDirective of directives) {
        if (deputation) {
            outputChannel.appendLine(`[EJB-CORE] Loading directive: ${enrichedDirective.name}`);
        }
        const directivePlugin: EjbDirectivePlugin = {
            name: enrichedDirective.name,
            description: enrichedDirective.description,
            children: enrichedDirective.children,
            children_type: enrichedDirective.children_type,
            example: enrichedDirective.example,
            parents: enrichedDirective.parents?.map(p => ({
                name: p.name,
                description: p.description,
            })) as EjbDirectiveParent[] | undefined,
        };
        virtualDirectives[enrichedDirective.name.toString()] = directivePlugin;
    }
    
    ejb.directives = { ...ejb.directives, ...virtualDirectives };
    
    if (deputation) {
        outputChannel.appendLine(`[EJB-CORE] ${Object.keys(ejb.directives).length} directives loaded.`);
    }

    return ejb;
}

export * from 'ejb';
