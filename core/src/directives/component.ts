import type { Kire } from "../kire";

export default (kire: Kire) => {
	// @component('path', {vars}) ... @end
	// Uses slots.

	kire.directive({
		name: "slot",
		params: ["name:string"],
		children: true,
		type: "html",
		description: "Defines a named content slot within a component.",
		example: `@slot('header')\n  <h1>This is the header</h1>\n@end`,
		onCall(c) {
			const name = c.param("name");
			c.res(`$slots[${JSON.stringify(name)}] = await (async ($parentCtx) => {`);
			c.res(`  const $ctx = $parentCtx.clone();`);
			if (c.children) c.set(c.children);
			c.res(`  return $ctx[Symbol.for('~response')];`);
			c.res(`})($ctx);`);
		},
	});

	kire.directive({
		name: "component",
		params: ["path:string", "variables:object"],
		children: true,
		type: "html",
		description:
			"Loads a template as a reusable component, allowing content to be passed into named slots.",
		example: `@component('card', { title: 'My Card' })\n  @slot('header')\n    <h1>Card Header</h1>\n  @end\n  <p>Default content.</p>\n@end`,
		async onCall(ctx) {
			const pathExpr = ctx.param("path");
			const varsExpr = ctx.param("variables") || "{}";

			ctx.res(`await (async () => {`);
			ctx.res(`  const $slots = {};`);

			ctx.res(`  const $bodyCtx = $ctx.clone();`);
			ctx.res(`  $bodyCtx.slots = $slots;`);

			ctx.res(`  await (async ($parentCtx) => {`);
			ctx.res(`    const $ctx = $bodyCtx;`); // Shadow $ctx
			ctx.res(`    with($ctx) {`);

			if (ctx.children) await ctx.set(ctx.children);

			ctx.res(`    }`);
			ctx.res(`  })($ctx);`);

			ctx.res(`  if (!$slots.default) $slots.default = $bodyCtx[Symbol.for('~response')];`);

			// Now load the component template
			ctx.res(`  const path = $ctx.resolve(${JSON.stringify(pathExpr)});`);
			ctx.res(`  const templateFn = await $ctx.load(path);`);
			ctx.res(`  if (templateFn) {`);
						ctx.res(`  const locals = ${varsExpr};`);
						ctx.res(`  const componentCtx = $ctx.clone(locals);`);
						ctx.res(`  componentCtx[${JSON.stringify(kire.varLocals)}] = locals;`); // Expose locals under the configured name
						ctx.res(`  if(typeof locals === 'object' && locals !== null) locals.slots = $slots;`); // Attach slots to locals for it.slots access
						ctx.res(`  componentCtx.slots = $slots;`); // Pass slots to component
						ctx.res(`  await templateFn(componentCtx);`);
						ctx.res(`  $ctx.res(componentCtx[Symbol.for('~response')]);`);
			ctx.res(`  }`);

			ctx.res(`})();`);
		},
	});
};

