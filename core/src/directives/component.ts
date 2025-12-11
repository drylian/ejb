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
			c.raw(`await $ctx.$merge(async ($ctx) => {`);
			if (c.children) c.set(c.children);
			c.raw(`  $slots[${JSON.stringify(name)}] = $ctx['~res'];`);
			c.raw(`  $ctx['~res'] = '';`);
			c.raw(`});`);
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

			// Run children to populate slots
			ctx.raw(`  await $ctx.$merge(async ($ctx) => {`);
			// Inject $slots into scope for @slot to access
			// But wait, @slot uses $slots from closure scope if defined in `component` block.
			// `const $slots = {}` is in the `await (async () => {` block.
			// @slot runs inside `$ctx.$merge`.
			// The closure scope is preserved.
			// But we need to make sure `default` slot is captured correctly.
			// Default slot is whatever is output by children (excluding what @slot captures/clears).
			// @slot clears its output. So `~res` will contain only non-slot content.
			
			// We need to expose `$slots` to children if they need it? No, @slot uses it from parent scope.
			// But wait, `slot` directive code `c.raw` will be emitted inside `component` body code.
			// So `$slots` variable is available.
			
			// However, `component` used `$bodyCtx.slots = $slots`.
			// If we remove `$bodyCtx`, we rely on closure variable `$slots`.
			
			ctx.raw(`    $ctx.slots = $slots;`); // Should we attach to ctx? Maybe for nested access?
			
			if (ctx.children) await ctx.set(ctx.children);

			ctx.raw(`    if (!$slots.default) $slots.default = $ctx['~res'];`);
			ctx.raw(`    $ctx['~res'] = '';`); // Clear default content from parent stream
			ctx.raw(`  });`);

			// Now load the component template
			ctx.raw(`  const path = $ctx.resolve(${JSON.stringify(pathExpr)});`);
			ctx.raw(`  const locals = ${varsExpr};`);
			ctx.raw(`  const templateFn = await $ctx.require(path, $ctx, locals);`);
			ctx.raw(`  if (templateFn) {`);
			
			// Render component template
			// We use $merge to capture output or just run it?
			// Component output SHOULD be rendered to parent stream.
			// But we need isolated scope for locals?
			// "remover o const child = { ...this }".
			// So we use global context + $merge (which handles res buffer).
			// We assign locals to global context?
			
			ctx.raw(`    await $ctx.$merge(async ($ctx) => {`);
			ctx.raw(`      Object.assign($ctx, locals);`);
			ctx.raw(`      $ctx[${JSON.stringify(kire.varLocals)}] = locals;`);
			ctx.raw(`      if(typeof locals === 'object' && locals !== null) locals.slots = $slots;`);
			ctx.raw(`      $ctx.slots = $slots;`);
			
			ctx.raw(`      await templateFn($ctx);`);
			ctx.raw(`    });`);
			
			ctx.raw(`  }`);

			ctx.raw(`})();`);
		},
	});
};