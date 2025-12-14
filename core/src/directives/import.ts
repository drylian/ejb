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
		onCall(ctx) {
			const pathExpr = ctx.param("path");
			const localsExpr = ctx.param("locals") || "{}";

			ctx.raw(`await $ctx.$merge(async ($ctx) => {
    const html = await $ctx.$require(${JSON.stringify(pathExpr)}, ${localsExpr});
    if (html !== null) { // $require pode retornar null se não encontrar
        $ctx.res(html);
    }
});`);
		},
	});
};