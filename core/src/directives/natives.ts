import type { Kire } from "../kire";

export default (kire: Kire) => {
	kire.directive({
		name: "if",
		params: ["cond:string"],
		children: true,
		type: "js",
		description:
			"Conditionally renders a block of content if the expression is true.",
		example: `@if(user.isLoggedIn)\n  Welcome, {{ user.name }}!\n@end`,
		parents: [
			{
				name: "elseif",
				params: ["cond:string"],
				children: true,
				type: "js",
				description:
					"Renders a block of content if the preceding @if/@elseif is false and the current expression is true.",
				example: `@elseif(user.isAdmin)\n  Admin access granted.\n@end`,
				async onCall(compiler) {
					compiler.raw(`} else if (${compiler.param("cond")}) {`);
					if (compiler.children) await compiler.set(compiler.children);
				},
			},
			{
				name: "elif", // alias for elseif
				params: ["cond:string"],
				children: true,
				type: "js",
				description: "Alias for @elseif.",
				example: `@elif(user.isAdmin)\n  Admin access granted.\n@end`,
				async onCall(compiler) {
					compiler.raw(`} else if (${compiler.param("cond")}) {`);
					if (compiler.children) await compiler.set(compiler.children);
				},
			},
			{
				name: "else",
				children: true,
				type: "js",
				description:
					"Renders a block of content if the preceding @if/@elseif expressions are all false.",
				example: `@else\n  Please log in.\n@end`,
				async onCall(compiler) {
					compiler.raw(`} else {`);
					if (compiler.children) await compiler.set(compiler.children);
				},
			},
		],
		async onCall(compiler) {
			compiler.raw(`if (${compiler.param("cond")}) {`);
			if (compiler.children) await compiler.set(compiler.children);
			if (compiler.parents) await compiler.set(compiler.parents);
			compiler.raw("}");
		},
	});

	kire.directive({
		name: "for",
		params: ["expr:string"],
		children: true,
		type: "js",
		description:
			"Iterates over an array or object, similar to a JavaScript for...of loop.",
		example: `@for(user of users)\n  <p>{{ user.name }}</p>\n@end`,
		async onCall(compiler) {
			const expr = compiler.param("expr");
			if (expr.includes(" in ")) {
				const [lhs, rhs] = expr.split(" in ");
				compiler.raw(`for (const ${lhs.trim()} in ${rhs.trim()}) {`);
			} else if (expr.includes(" of ")) {
				const [lhs, rhs] = expr.split(" of ");
				compiler.raw(`for (const ${lhs.trim()} of ${rhs.trim()}) {`);
			} else {
				compiler.raw(`for (${expr}) {`);
			}

			if (compiler.children) await compiler.set(compiler.children);
			compiler.raw(`}`);
		},
	});

	kire.directive({
		name: "const",
		params: ["expr:string"],
		type: "js",
		description:
			"Declares a block-scoped constant, similar to JavaScript `const`.",
		example: `@const(myVar = 'hello world')`,
		onCall(compiler) {
			compiler.raw(`const ${compiler.param("expr")};`);
		},
	});

	kire.directive({
		name: "let",
		params: ["expr:string"],
		type: "js",
		description:
			"Declares a block-scoped local variable, similar to JavaScript `let`.",
		example: `@let(counter = 0)`,
		onCall(compiler) {
			compiler.raw(`let ${compiler.param("expr")};`);
		},
	});

	kire.directive({
		name: "code",
		children: true,
		type: "js",
		description: "Executes a block of raw JavaScript code on the server.",
		example: `@code\n  console.log('This runs during template compilation.');\n@end`,
		onCall(compiler) {
			if (compiler.children) {
				let code = "";
				for (const child of compiler.children) {
					if (child.type === "text" && child.content) {
						code += child.content;
					}
				}
				if (code) {
					compiler.raw(code);
				}
			}
		},
	});

	// Register case and default globally/independently so they are not treated as chained parents of switch
	kire.directive({
		name: "case",
		params: ["val:string"],
		children: true,
		type: "js",
		description: "A case clause for a @switch statement.",
		example: `@case('A')\n  <p>Value is A</p>\n@end`,
		async onCall(c) {
			c.raw(`case ${JSON.stringify(c.param("val"))}: {`);
			if (c.children) await c.set(c.children);
			c.raw(`break; }`);
		},
	});

	kire.directive({
		name: "default",
		children: true,
		type: "js",
		description: "The default clause for a @switch statement.",
		example: `@default\n  <p>Value is something else</p>\n@end`,
		async onCall(c) {
			c.raw(`default: {`);
			if (c.children) await c.set(c.children);
			c.raw(`}`);
		},
	});

	kire.directive({
		name: "switch",
		params: ["expr:string"],
		children: true,
		type: "js",
		description:
			"Provides a control flow statement similar to a JavaScript switch block.",
		example: `@switch(value)\n  @case(1) ... @end\n  @default ... @end\n@end`,
		async onCall(compiler) {
			compiler.raw(`switch (${compiler.param("expr")}) {`);
			if (compiler.children) {
				// Filter only case/default nodes to avoid invalid JS (text nodes in switch block)
				const cases = compiler.children.filter(n => n.name === 'case' || n.name === 'default');
				await compiler.set(cases);
			}
			compiler.raw(`}`);
		},
	});
};
