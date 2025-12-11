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

			ctx.raw(`await (async () => {
    const path = $ctx.resolve(${JSON.stringify(pathExpr)});
    const locals = ${localsExpr};
    const templateFn = await $ctx.require(path, $ctx, locals);
    
    if (templateFn) {
        const childCtx = $ctx.clone(locals);
        childCtx[${JSON.stringify(kire.varLocals)}] = locals;
        await templateFn(childCtx);
        $ctx.res(childCtx[Symbol.for('~response')]);
    }
})();`);
		},
	});
};