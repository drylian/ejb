import type { Kire } from "../kire";

export default (kire: Kire) => {
	kire.directive({
		name: "include",
		params: ["path:string", "locals:object"],
		children: false,
		type: "html",
		description:
			"Includes and renders a template from a given path, optionally passing local variables.",
		example: `@include('partials/card')`,
		onCall(compiler) {
			const pathExpr = compiler.param("path");
			const localsExpr = compiler.param("locals") || "{}";

			compiler.raw(`await $ctx.$merge(async ($ctx) => {
    const html = await $ctx.$require(${JSON.stringify(pathExpr)}, ${localsExpr});
    if (html !== null) {
        $ctx.res(html);
    }
});`);
		},
	});
};