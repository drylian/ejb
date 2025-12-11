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
    const path = $ctx.resolve(${JSON.stringify(pathExpr)});
    const locals = ${localsExpr};
    const templateFn = await $ctx.require(path, $ctx, locals);
    
    if (templateFn) {
        Object.assign($ctx, locals);
        if(${JSON.stringify(kire.exposeLocals)}) $ctx[${JSON.stringify(kire.varLocals)}] = locals;
        
        await templateFn($ctx);
    }
});`);
		},
	});
};