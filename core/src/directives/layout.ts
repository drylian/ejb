import type { Kire } from "../kire";
import type { KireContext } from "../types";

export default (kire: Kire) => {
	// Initialize global defines object
	kire.$ctx("defines", {});

	kire.directive({
		name: "define",
		params: ["name:string"],
		children: true,
		type: "html",
		description:
			"Defines a named, reusable section of content that can be rendered elsewhere.",
		example: `@define('header')\n  <h1>My Website</h1>\n@end`,
		onCall(ctx) {
			const name = ctx.param("name");

			ctx.res(
				`$ctx.defines[${JSON.stringify(name)}] = await (async ($parentCtx) => {`,
			);
			ctx.res(`  const $ctx = $parentCtx.clone();`);

			if (ctx.children) ctx.set(ctx.children);

			ctx.res(`  return $ctx[Symbol.for('~response')];`);
			ctx.res(`})($ctx);`);
		},
	});

	kire.directive({
		name: "defined",
		params: ["name:string"],
		type: "html",
		description: "Renders a content section previously created with @define.",
		example: `@defined('header')`,
		onCall(ctx) {
			const name = ctx.param("name");

			ctx.res(
				`$ctx.res("<!-- KIRE:defined(" + ${JSON.stringify(name)} + ") -->");`,
			);

			ctx.pos(`
                // Post-process defined placeholders
                if ($ctx.defines) {
                    for (const key in $ctx.defines) {
                        const placeholder = "<!-- KIRE:defined(" + key + ") -->";
                        if ($ctx[Symbol.for('~response')].includes(placeholder)) {
                             $ctx[Symbol.for('~response')] = $ctx[Symbol.for('~response')].split(placeholder).join($ctx.defines[key]);
                        }
                    }
                    // Cleanup unmatched placeholders?
                    $ctx[Symbol.for('~response')] = $ctx[Symbol.for('~response')].replace(/<!-- KIRE:defined\\(.*?\\) -->/g, '');
                }
            `);
		},
	});

	// Initialize global stacks object
	kire.$ctx("stacks", {});

	kire.directive({
		name: "stack",
		params: ["name:string"],
		type: "html",
		description:
			"Creates a placeholder where content pushed to a named stack will be rendered.",
		example: `<html>\n<head>\n  @stack('scripts')\n</head>\n</html>`,
		onCall(ctx) {
			const name = ctx.param("name");
			ctx.res(
				`$ctx.res("<!-- KIRE:stack(" + ${JSON.stringify(name)} + ") -->");`,
			);

			ctx.pos(`
                if ($ctx.stacks) {
                    for (const key in $ctx.stacks) {
                         const placeholder = "<!-- KIRE:stack(" + key + ") -->";
                         if ($ctx[Symbol.for('~response')].includes(placeholder)) {
                              const content = $ctx.stacks[key].join('\\n');
                              $ctx[Symbol.for('~response')] = $ctx[Symbol.for('~response')].split(placeholder).join(content);
                         }
                    }
                    $ctx[Symbol.for('~response')] = $ctx[Symbol.for('~response')].replace(/<!-- KIRE:stack\\(.*?\\) -->/g, '');
                }
             `);
		},
	});

	kire.directive({
		name: "push",
		params: ["name:string"],
		children: true,
		type: "html",
		description: "Pushes a block of content onto a named stack.",
		example: `@push('scripts')\n  <script src="app.js"></script>\n@end`,
		onCall(ctx: KireContext) {
			const name = ctx.param("name");
			ctx.res(
				`if (!$ctx.stacks[${JSON.stringify(name)}]) $ctx.stacks[${JSON.stringify(name)}] = [];`,
			);
			ctx.res(
				`$ctx.stacks[${JSON.stringify(name)}].push(await (async ($parentCtx) => {`,
			);
			ctx.res(`  const $ctx = $parentCtx.clone();`);

			if (ctx.children) ctx.set(ctx.children);

			ctx.res(`  return $ctx[Symbol.for('~response')];`);
			ctx.res(`})($ctx));`);
		},
	});
};
