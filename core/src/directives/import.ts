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

			ctx.res(`await (async () => {
    const path = $ctx.resolve(${JSON.stringify(pathExpr)});
    const templateFn = await $ctx.load(path);
    
    if (templateFn) {
        const locals = ${localsExpr};
        const childCtx = $ctx.clone(locals);
        childCtx[${JSON.stringify(kire.varLocals)}] = locals;
        await templateFn(childCtx);
        $ctx.res(childCtx[Symbol.for('~response')]);
    }
})();`);
		},
	});
};