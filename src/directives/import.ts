import { ejbDirective } from "../constants";
import { ejbParser } from "../parser";
import {
	escapeJs,
	filepathResolver,
	isPromise,
	PromiseResolver,
} from "../utils";

export default ejbDirective({
	name: "import",
	priority: 10,
	children: false,
	// onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
	// onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
	onInit: (ejb) =>
		`$ejb.res += ${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`,
	onEnd: () => "})({ ...$ejb, res:'' });",
	onParams: (ejb, exp) => {
		const expIdx = exp.indexOf(",");
		const path = (expIdx === -1 ? exp : exp.slice(0, expIdx))
			.trim()
			.replace(/['"`]/g, "");
		const params = (expIdx === -1 ? "{}" : exp.slice(expIdx + 1)).trim();

		if (!ejb.resolver) {
			throw new Error(
				`[EJB] @import directive requires a resolver to be configured.`,
			);
		}

		try {
			const resolved = ejb.resolver(filepathResolver(ejb, path));

			if (!ejb.async && isPromise(resolved)) {
				throw new Error(
					`[EJB] Resolver for path "${path}" returned a Promise in sync mode. A sync resolver must be provided.`,
				);
			}

			return PromiseResolver(resolved, (content: string) => {
				const ast = ejbParser(ejb, content);
				const code = ejb.compileNode(ast);

				if (!ejb.async && isPromise(code)) {
					throw new Error(
						`[EJB] Sync import compilation for "${path}" unexpectedly resulted in a Promise.`,
					);
				}

				return PromiseResolver(code, (code: string) => {
					return [
						"const $_import = { ...$ejb, res: '' };",
						`const $_variables = { ...${ejb.globalvar}, ...(${params}) };`,
						`return new $ejb.EjbFunction('$ejb', $ejb.ins.globalvar, \`${escapeJs(code)}\\nreturn $ejb.res;\`)($_import, $_variables)`,
					].join("\n");
				});
			});
		} catch (e: any) {
			console.error(`[EJB] Failed to resolve import for path: ${path}`, e);
			return `return \`<!-- EJB Import Error: ${escapeJs(e.message)} -->\`;`;
		}
	},
});
