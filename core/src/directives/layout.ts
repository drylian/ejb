import type { Kire } from "../kire";

export default (kire: Kire) => {
	kire.directive({
		name: "define",
		params: ["name:string"],
		children: true,
		type: "html",
		description: "Defines a named, reusable section of content.",
		example: `@define('header')\n  <h1>My Website</h1>\n@end`,
		async onCall(ctx) {
			const name = ctx.param("name");

			if (ctx.children) {
				ctx.raw(`await $ctx.$merge(async ($ctx) => {`);
				await ctx.set(ctx.children);
				ctx.raw(`  $ctx['~defines'][${JSON.stringify(name)}] = $ctx['~res'];`);
				ctx.raw(`  $ctx['~res'] = '';`);
				ctx.raw(`});`);
			}
		},
	});

	kire.element('kire:defined', (ctx) => {
		const defines = ctx.$typed<Record<string, string>>('~defines');
		const id = ctx.element.attributes.id!;
		if (defines[id] !== undefined) {
			ctx.replaceElement(defines[id]);
		}
	})

	kire.directive({
		name: "defined",
		params: ["name:string"],
		children: "auto",
		type: "html",
		description: "Renders defined content or fallback.",
		example: `@defined('header')\n  Conteúdo não encontrado\n@end`,
		onInit(ctx) {
			ctx["~defines"] = ctx["~defines"] || {};
		},
		async onCall(ctx) {
			const name = ctx.param("name");

			if (ctx.children?.length) {
				ctx.res(`<kire:defined id=${JSON.stringify(name)}>`);
				await ctx.set(ctx.children);
				ctx.res(`</kire:defined>`);
			} else {
				ctx.res(`<kire:defined id=${JSON.stringify(name)}></kire:defined>`);
			}
		},
	});

	kire.directive({
		name: "stack",
		params: ["name:string"],
		type: "html",
		description:
			"Creates a placeholder where content pushed to a named stack will be rendered.",
		example: `<html>\n<head>\n  @stack('scripts')\n</head>\n</html>`,
		children: false,
		onCall(compiler) {
			const name = compiler.param("name");
			compiler.raw(
				`$ctx.res("<!-- KIRE:stack(" + ${JSON.stringify(name)} + ") -->");`
			);
		},
		onInit(ctx) {
			ctx['~stacks'] = ctx['~stacks'] || {};
			
			ctx['~$pos'].push(async (c: any) => {
				const ctx = c as any;
				if (ctx['~stacks']) {
					for (const key in ctx['~stacks']) {
						const placeholder = "<!-- KIRE:stack(" + key + ") -->";
						if (ctx['~res'].includes(placeholder)) {
							const content = ctx['~stacks'][key].join('\n');
							ctx['~res'] = ctx['~res'].split(placeholder).join(content);
						}
					}
					ctx['~res'] = ctx['~res'].replace(/<!-- KIRE:stack\(.*?\) -->/g, '');
				}
			});
		}
	});

	kire.directive({
		name: "push",
		params: ["name:string"],
		children: true,
		type: "html",
		description: "Pushes a block of content onto a named stack.",
		example: `@push('scripts')\n  <script src="app.js"></script>\n@end`,
		async onCall(compiler) {
			const name = compiler.param("name");
			compiler.raw(`if(!$ctx['~stacks']) $ctx['~stacks'] = {};`);
			compiler.raw(
				`if (!$ctx['~stacks'][${JSON.stringify(name)}]) $ctx['~stacks'][${JSON.stringify(name)}] = [];`
			);
			compiler.raw(
				`await $ctx.$merge(async ($ctx) => {`
			);

			if (compiler.children) await compiler.set(compiler.children);

			compiler.raw(`  $ctx['~stacks'][${JSON.stringify(name)}].push($ctx['~res']);`);
			compiler.raw(`  $ctx['~res'] = '';`);
			compiler.raw(`});`);
		},
	});
};