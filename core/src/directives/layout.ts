import type { Kire } from "../kire";
import type { KireContext } from "../types";

export default (kire: Kire) => {
	// Initialize global defines object via runtime checks, not kire.$ctx
	
kire.directive({
		name: "define",
		params: ["name:string"],
		children: true,
		type: "html",
		description:
			"Defines a named, reusable section of content that can be rendered elsewhere.",
		example: `@define('header')\n  <h1>My Website</h1>\n@end`,
		async onCall(ctx) {
			const name = ctx.param("name");

			ctx.raw(`if(!$ctx['~defines']) $ctx['~defines'] = {};`);
			ctx.raw(`await $ctx.$merge(async ($ctx) => {`);

			if (ctx.children) await ctx.set(ctx.children);

			ctx.raw(`  $ctx['~defines'][${JSON.stringify(name)}] = $ctx['~res'];`);
			ctx.raw(`  $ctx['~res'] = '';`);
			ctx.raw(`});`);
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

			ctx.raw(
				`$ctx.res("<!-- KIRE:defined(" + ${JSON.stringify(name)} + ") -->");`
			);
		},
		once(ctx) {
			ctx.$pre(`if(!$ctx['~defines']) $ctx['~defines'] = {};`);
			ctx.$pos(`
                // Post-process defined placeholders
                if ($ctx['~defines']) {
                    for (const key in $ctx['~defines']) {
                        const placeholder = "<!-- KIRE:defined(" + key + ") -->";
                        if ($ctx['~res'].includes(placeholder)) {
                             $ctx['~res'] = $ctx['~res'].split(placeholder).join($ctx['~defines'][key]);
                        }
                    }
                    // Cleanup unmatched placeholders?
                    $ctx['~res'] = $ctx['~res'].replace(/<!-- KIRE:defined\\(.*?\\) -->/g, '');
                }
            `);
		}
	});

	kire.directive({
		name: "stack",
		params: ["name:string"],
		type: "html",
		description:
			"Creates a placeholder where content pushed to a named stack will be rendered.",
		example: `<html>\n<head>\n  @stack('scripts')\n</head>\n</html>`,
		onCall(ctx) {
			const name = ctx.param("name");
			ctx.raw(
				`$ctx.res("<!-- KIRE:stack(" + ${JSON.stringify(name)} + ") -->");`
			);
		},
		once(ctx) {
			ctx.$pre(`if(!$ctx['~stacks']) $ctx['~stacks'] = {};`);
			ctx.$pos(`
                if ($ctx['~stacks']) {
                    for (const key in $ctx['~stacks']) {
                         const placeholder = "<!-- KIRE:stack(" + key + ") -->";
                         if ($ctx['~res'].includes(placeholder)) {
                              const content = $ctx['~stacks'][key].join('\\n');
                              $ctx['~res'] = $ctx['~res'].split(placeholder).join(content);
                         }
                    }
                    $ctx['~res'] = $ctx['~res'].replace(/<!-- KIRE:stack\\(.*?\\) -->/g, '');
                }
             `);
		}
	});

	kire.directive({
		name: "push",
		params: ["name:string"],
		children: true,
		type: "html",
		description: "Pushes a block of content onto a named stack.",
		example: `@push('scripts')\n  <script src="app.js"></script>\n@end`,
		async onCall(ctx: KireContext) {
			const name = ctx.param("name");
			ctx.raw(`if(!$ctx['~stacks']) $ctx['~stacks'] = {};`);
			ctx.raw(
				`if (!$ctx['~stacks'][${JSON.stringify(name)}]) $ctx['~stacks'][${JSON.stringify(name)}] = [];`
			);
			ctx.raw(
				`await $ctx.$merge(async ($ctx) => {`
			);

			if (ctx.children) await ctx.set(ctx.children);

			ctx.raw(`  $ctx['~stacks'][${JSON.stringify(name)}].push($ctx['~res']);`);
			ctx.raw(`  $ctx['~res'] = '';`);
			ctx.raw(`});`);
		},
	});
};