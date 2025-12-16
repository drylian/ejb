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
		onCall(compiler) {
			const name = compiler.param("name");
			compiler.raw(`await $ctx.$merge(async ($ctx) => {`);
			if (compiler.children) compiler.set(compiler.children);
			compiler.raw(`  $slots[${JSON.stringify(name)}] = $ctx['~res'];`);
			compiler.raw(`  $ctx['~res'] = '';`);
			compiler.raw(`});`);
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
		async onCall(compiler) {
			const pathExpr = compiler.param("path");
			const varsExpr = compiler.param("variables") || "{}";

			compiler.raw(`await (async () => {`);
			compiler.raw(`  const $slots = {};`);

			// Run children to populate slots
			compiler.raw(`  await $ctx.$merge(async ($ctx) => {`);
			compiler.raw(`    $ctx.slots = $slots;`); // Still expose slots to children if they need it
			
			if (compiler.children) await compiler.set(compiler.children);

			compiler.raw(`    if (!$slots.default) $slots.default = $ctx['~res'];`);
			compiler.raw(`    $ctx['~res'] = '';`); // Clear default content from parent stream
			compiler.raw(`  });`);

			// Now load the component template and render it
			compiler.raw(`  const path = ${JSON.stringify(pathExpr)};`);
			compiler.raw(`  const componentLocals = ${varsExpr};`);
			
			compiler.raw(`  const finalLocals = { ...componentLocals };`);
			compiler.raw(`  if (typeof finalLocals === 'object' && finalLocals !== null) finalLocals.slots = $slots;`); // Add slots to locals

			compiler.raw(`  const html = await $ctx.$require(path, finalLocals);`);
			compiler.raw(`  if (html !== null) {`);
			compiler.raw(`    $ctx.res(html);`);
			compiler.raw(`  }`);

			compiler.raw(`})();`);
		},
	});
};