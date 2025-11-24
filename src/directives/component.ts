import { ejbDirective } from "../constants";
import { ejbParser } from "../parser";
import { escapeJs, filepathResolver, returnEjbRes } from "../utils";

export default ejbDirective({
	name: "component",
	priority: 10,
	children: true,
	params: [
		{ name: "path", type: "string", required: true },
		{ name: "variables", type: "object", default: "{}" },
	],
	parents: [
		{
			name: "slot",
			internal: true,
			onParams: (_, exp) => {
				// Added exp here
				return `$slots["$" + ${exp.raw}] = await (async ($ejb) => {`;
			},
			onEnd: () => "\nreturn $ejb.res;})({ ...$ejb, res:'' });",
		},
	],
	onInit: () => `$ejb.res += await (async ($ejb) => { const $slots = {};\n`,
	onEnd: () =>
		`return $_component($_import, {...$_variables, ...$slots}); })( { ...$ejb, res:'' });`,
	onChildren: async (ejb, { children, parents }) => {
		const compiledChildren = await ejb.compile(children);
		const compiledParents = await ejb.compile(parents ?? []);
		return `$slots.$slot = ${returnEjbRes(compiledChildren)} ?? "";\n ${compiledParents ?? ""}\n`;
	},
	onParams: async (ejb, exp) => {
		const path = exp.getString("path");
		const params = exp.getRaw("variables");

		if (!path) {
			throw new Error("[EJB] @component directive requires a path.");
		}

		if (!ejb.resolver) {
			throw new Error(
				`[EJB] @ directive requires a resolver to be configured.`,
			);
		}

		try {
			const resolvedContent = await ejb.resolver(filepathResolver(ejb, path));

			const ast = ejbParser(ejb, resolvedContent);
			const code = await ejb.compile(ast);

			return [
				"const $_import = { ...$ejb, res: '' };",
				`const $_variables = { ...${ejb.globalvar}, ...(${params}) };`,
				`const $_component = new $ejb.EjbFunction('$ejb', $ejb.ins.globalvar, \`${escapeJs(code)}\\nreturn $ejb.res;\`);\n`,
			].join("\n");
		} catch (e: any) {
			console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
			return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
		}
	},
});
