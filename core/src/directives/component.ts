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
			c.raw(`$slots[${JSON.stringify(name)}] = await (async ($parentCtx) => {`);
			c.raw(`  const $ctx = $parentCtx.clone();`);
			if (c.children) c.set(c.children);
			c.raw(`  return $ctx[Symbol.for('~response')];`);
			c.raw(`})($ctx);`);
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

			ctx.raw(`await (async () => {`);
			ctx.raw(`  const $slots = {};`);

			ctx.raw(`  const $bodyCtx = $ctx.clone();`);
			ctx.raw(`  $bodyCtx.slots = $slots;`);

			ctx.raw(`  await (async ($parentCtx) => {`);
			ctx.raw(`    const $ctx = $bodyCtx;`); // Shadow $ctx
			ctx.raw(`    with($ctx) {`);

			if (ctx.children) await ctx.set(ctx.children);

			ctx.raw(`    }`);
			ctx.raw(`  })($ctx);`);

			ctx.raw(`  if (!$slots.default) $slots.default = $bodyCtx[Symbol.for('~response')];`);

			// Now load the component template
			ctx.raw(`  const path = $ctx.resolve(${JSON.stringify(pathExpr)});`);
			ctx.raw(`  const locals = ${varsExpr};`);
			ctx.raw(`  const templateFn = await $ctx.require(path, $ctx, locals);`);
			ctx.raw(`  if (templateFn) {`);
						ctx.raw(`  const componentCtx = $ctx.clone(locals);`);
						ctx.raw(`  componentCtx[${JSON.stringify(kire.varLocals)}] = locals;`); // Expose locals under the configured name
						ctx.raw(`  if(typeof locals === 'object' && locals !== null) locals.slots = $slots;`); // Attach slots to locals for it.slots access
						ctx.raw(`  componentCtx.slots = $slots;`); // Pass slots to component
						ctx.raw(`  await templateFn(componentCtx);`);
						ctx.raw(`  $ctx.res(componentCtx[Symbol.for('~response')]);`);
			ctx.raw(`  }`);

			ctx.raw(`})();`);
		},
	});
};

