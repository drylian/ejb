import { EjbAst, ejbDirective } from "../constants";
import type { EjbDirectivePlugin, EjbChildrenContext } from "../types";
import type { EjbBuilder } from "../builder";
import type { Expression } from '../expression';

function getRawContent(children: EjbChildrenContext['children']): string {
    let rawContent = '';
    for (const node of children) {
        if (node.type === EjbAst.Text) {
            rawContent += node.value;
        }
        // Note: This ignores other node types like interpolations for now.
    }
    return rawContent;
}

// Handles @client { ...script... } @end
const clientScriptDirective: EjbDirectivePlugin = {
    name: 'client',
    children: true,

    async onChildrenBuild(builder: EjbBuilder, { children }: EjbChildrenContext) {
        // Compile the inner content in "string mode". This resolves any directives
        // inside the block (like @fetch) into their JS string representation.
        const compiledJs = await builder.compile(children, true);
        const wrappedContent = `$ejb.js(async ($ejb) => {\n${compiledJs}\n});\n`;
        
        builder.load('client').add(wrappedContent);
        builder.load('server'); // Restore loader
    },
};

// Handles @clientTemplate('name', {props}) { ...template... } @end
const clientTemplateDirective: EjbDirectivePlugin = {
    name: 'clientTemplate',
    children: true,
    
    onParamsBuild(builder: EjbBuilder, exp: Expression) {
        (this as any).templateName = exp.getRaw('0');
        (this as any).templateProps = exp.getRaw('1') || '{}';
    },

    async onChildrenBuild(builder: EjbBuilder, { children }: EjbChildrenContext) {
        const name = (this as any).templateName;
        const props = (this as any).templateProps;

        if (!name) {
            // In a real implementation, we'd push an error to the builder.
            console.error("[EJB] @clientTemplate requires a name.");
            return;
        }

        // Compile the inner template content into executable JS that builds a string.
        const templateJs = await builder.compile(children, false);

        const wrappedContent = `$ejb.load(${name}, async ($ejb, ${props}) => {\n${templateJs}\n});\n`;

        builder.load('client').add(wrappedContent);
        builder.load('server'); // Restore loader
    }
};

export default {
    ...ejbDirective(clientScriptDirective),
    ...ejbDirective(clientTemplateDirective)
};
