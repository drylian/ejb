import { ejbDirective } from "../constants";
import type { EjbDirectivePlugin, EjbChildrenContext } from "../types";
import type { EjbBuilder } from "../builder";
import type { Expression } from '../expression';

export default ejbDirective({
    name: 'css',
    children: true,
    
    onParamsBuild(builder: EjbBuilder, exp: Expression) {
        const isGlobal = exp.getRaw('0') === "'global'";
        // Store the scope in the directive's execution context.
        (this as any).isGlobal = isGlobal;
    },

    async onChildrenBuild(builder: EjbBuilder, { children }: EjbChildrenContext) {
        // Compile the inner content of the directive. 
        // `stringMode=true` is crucial to get the evaluated string instead of generated JS code.
        const cssContent = await builder.compile(children, true);

        const isGlobal = (this as any).isGlobal;

        if (isGlobal) {
            const originalFile = builder.current;
            // Switch context to the special global file, add content, then restore.
            builder.file('_EJB_GLOBAL_').load('css').add(cssContent);
            builder.file(originalFile).load('server'); // Restore previous state
        } else {
            const originalLoader = builder.loader;
            // Add to the current file's CSS artefact, then restore loader.
            builder.load('css').add(cssContent);
            builder.load(originalLoader); // Restore previous state
        }
    },
} as EjbDirectivePlugin);
