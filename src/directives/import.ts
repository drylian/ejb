import { ejbDirective } from "../constants";
import { ejbParser } from "../parser";
import { escapeJs, filepathResolver } from "../utils";

export default ejbDirective({
	name: "import",
	priority: 10,
	children: false,
	description: "Imports and renders another EJB template file.",
	example: "@import('./path/to/template.ejb', { myVar: 'value' })",
	params: [
		{ name: "path", type: "string", required: true },
		{ name: "variables", type: "object", default: "{}" },
	],
	// onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
	onInit: (ejb) => {
		ejb.builder.add(` $ejb.res += await (async ($ejb) => {`);
	},
	onEnd: (ejb) => {
		ejb.builder.add(` })( { ...$ejb, res:'' });`);
	},
	onParams: async (ejb, exp) => {
		const path = exp.getString("path");
		const params = exp.getRaw("variables");

		if (!path) {
			throw new Error("[EJB] @import directive requires a path.");
		}

		if (!ejb.resolver) {
			throw new Error(
				`[EJB] @import directive requires a resolver to be configured.`,
			);
		}

		try {
			const resolvedContent = await ejb.resolver(
				filepathResolver(ejb, path),
			);

			const ast = ejbParser(ejb, resolvedContent);
			const code = await ejb.compile(ast);

			ejb.builder.add(
				[
					"const $_import = { ...$ejb, res: '' };",
					`const $_variables = { ...${ejb.globalvar}, ...(${params}) };`,
					`return new $ejb.EjbFunction('$ejb', $ejb.ins.globalvar, \`${escapeJs(code)}\\nreturn $ejb.res;\`)($_import, $_variables)`,
				].join("\n"),
			);
		} catch (e: any) {
			ejb.errors.push(e);
		}
	},
});
