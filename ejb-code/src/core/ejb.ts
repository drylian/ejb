/** ejb import */
import vscode from 'vscode';
import { ejb_store } from '@/core/state';
import { Ejb, type EjbDirectivePlugin, type EjbDirectiveParent } from 'ejb';
import type { EnrichedDirective } from '@/types/index';

function validateDirective(directive: EnrichedDirective, output_channel: vscode.OutputChannel): boolean {
    let is_valid = true;

    if (typeof directive.name !== 'string' || directive.name.trim() === '') {
        output_channel.append(`[EJB-Validation] Directive from package '${directive.sourcePackage}' has an invalid or empty 'name': ${directive.name}`);
        is_valid = false;
    }
    if (typeof directive.description !== 'string') {
        output_channel.append(`[EJB-Validation] Directive '${directive.name}' from package '${directive.sourcePackage}' has an invalid 'description': ${directive.description}`);
        is_valid = false;
    }
    if (typeof directive.children !== 'boolean') {
        output_channel.append(`[EJB-Validation] Directive '${directive.name}' from package '${directive.sourcePackage}' has an invalid 'children' type: ${directive.children}`);
        is_valid = false;
    }

    if (directive.parents) {
        if (!Array.isArray(directive.parents)) {
            output_channel.append(`[EJB-Validation] Directive '${directive.name}' from package '${directive.sourcePackage}' has an invalid 'parents' type. Expected array.`);
            is_valid = false;
        } else {
            for (const parent of directive.parents) {
                if (typeof parent.name !== 'string' || parent.name.trim() === '') {
                    output_channel.append(`[EJB-Validation] Sub-directive in '${directive.name}' from package '${directive.sourcePackage}' has an invalid or empty 'name': ${parent.name}`);
                    is_valid = false;
                }
            }
        }
    }

    return is_valid;
}

export const createEJB = (output_channel: vscode.OutputChannel) => {
    const ejb = new Ejb();
    const { directives } = ejb_store.getState();
    
    const virtual_directives: Record<string, EjbDirectivePlugin> = {};

    for (const enriched_directive of directives) {
        if (validateDirective(enriched_directive, output_channel)) {
            const directive_plugin: EjbDirectivePlugin = {
                name: enriched_directive.name,
                description: enriched_directive.description,
                children: enriched_directive.children,
                children_type: enriched_directive.children_type,
                example: enriched_directive.example,
                parents: enriched_directive.parents?.map(p => ({
                    name: p.name,
                    description: p.description,
                })) as EjbDirectiveParent[] | undefined,
            };
            virtual_directives[enriched_directive.name.toString()] = directive_plugin;
        }
    }
    
    // Merge with default directives, giving precedence to virtualized ones
    ejb.directives = { ...ejb.directives, ...virtual_directives };
    
    return ejb;
}

export * from 'ejb';