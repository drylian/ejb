import { ejbDirective } from "../constants";
import type { EjbChildrenContext } from "../types";

// Handles @client { ...script... } @end
export default Object.assign(
	{},
	ejbDirective({
		name: "client",
		children: true,

		async onChildren(ejb, { children }: EjbChildrenContext) {
			// Compile the inner content in "string mode". This resolves any directives
			// inside the block (like @fetch) into their JS string representation.
			const compiledJs = await ejb.builder.compile(children, true);

			ejb.builder.load("client").add(compiledJs);
			ejb.builder.load("server"); // Restore loader
		},
	}),
	ejbDirective({
		name: "clientTemplate",
		children: true,

		onParams(_, exp) {
			(this as any).templateName = exp.getRaw("0");
			(this as any).templateProps = exp.getRaw("1") || "{}";
		},

		async onChildren(ejb, { children }) {
			const name = (this as any).templateName;
			const props = (this as any).templateProps;

			if (!name) {
				// In a real implementation, we'd push an error to the builder.
				console.error("[EJB] @clientTemplate requires a name.");
				return;
			}

			// Compile the inner template content into executable JS that builds a string.
			const templateJs = await ejb.compile(children, false);

			const wrappedContent = `$ejb.load(${name}, async ($ejb, ${props}) => {\n${templateJs}\n});\n`;

			ejb.builder.load("client").add(wrappedContent);
			ejb.builder.load("server"); // Restore loader
		},
	})
)
// Handles @clientTemplate('name', {props}) { ...template... } @end
