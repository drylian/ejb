import { ejbStore } from '@/core/state';
import { Ejb, type EjbDirectivePlugin, type EjbDirectiveParent } from 'ejb';

export const createEJB = () => {
    const ejb = new Ejb();
    const { directives } = ejbStore.getState();
    
    const virtualDirectives: Record<string, EjbDirectivePlugin> = {};

    for (const enrichedDirective of directives) {
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
    
    return ejb;
}

export * from 'ejb';
