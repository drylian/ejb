import { ejbDirective } from "../constants";
import type { EjbDirectivePlugin } from "../types";

export default ejbDirective({
	name: "css",
	children: true,

	onParams(_, exp) {
		const isGlobal = exp.getRaw("0") === "'global'";
		// Store the scope in the directive's execution context.
		(this as any).isGlobal = isGlobal;
	},

	async onChildren(ejb, { children }) {
		// Compile the inner content of the directive.
		// `stringMode=true` is crucial to get the evaluated string instead of generated JS code.
		const cssContent = await ejb.compile(children, true);

		const isGlobal = (this as any).isGlobal;

		if (isGlobal) {
			const originalFile = ejb.builder.current;
			// Switch context to the special global file, add content, then restore.
			ejb.builder.file("_EJB_GLOBAL_").load("css").add(cssContent);
			ejb.builder.file(originalFile).load("server"); // Restore previous state
		} else {
			const originalLoader = ejb.builder.loader;
			// Add to the current file's CSS artefact, then restore loader.
			ejb.builder.load("css").add(cssContent);
			ejb.builder.load(originalLoader); // Restore previous state
		}
	},
} as EjbDirectivePlugin);
