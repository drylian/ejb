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
			ctx.raw(`    $ctx.slots = $slots;`); // Still expose slots to children if they need it
			
			if (ctx.children) await ctx.set(ctx.children);

			ctx.raw(`    if (!$slots.default) $slots.default = $ctx['~res'];`);
			ctx.raw(`    $ctx['~res'] = '';`); // Clear default content from parent stream
			ctx.raw(`  });`);

			// Now load the component template and render it
			ctx.raw(`  const path = ${JSON.stringify(pathExpr)};`);
			ctx.raw(`  const componentLocals = ${varsExpr};`);
			
			ctx.raw(`  const finalLocals = { ...componentLocals };`);
			ctx.raw(`  if (typeof finalLocals === 'object' && finalLocals !== null) finalLocals.slots = $slots;`); // Add slots to locals

			ctx.raw(`  const html = await $ctx.$require(path, finalLocals);`);
			ctx.raw(`  if (html !== null) {`);
			ctx.raw(`    $ctx.res(html);`);
			ctx.raw(`  }`);

			ctx.raw(`})();`);
		},
	});
};