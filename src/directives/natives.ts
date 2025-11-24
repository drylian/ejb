import { ejbDirective } from "../constants";
import { md5 } from "../utils";

export default Object.assign(
	{},
	/**
	 * @const
	 */
	ejbDirective({
		name: "const",
		priority: 1,
		onParams: (_, exp) => {
			return `const ${exp.raw};`;
		},
	}),
	/**
	 * @let
	 */
	ejbDirective({
		name: "let",
		priority: 1,
		onParams: (ejb, exp) => {
			// Suporta EjbBuilder para SSR
			if ("res" in ejb && typeof ejb.res === "function") {
				const code = `let ${exp.raw};`;
				(ejb as any).res(code);
				return "";
			}
			return `let ${exp.raw};`;
		},
	}),
	/**
	 * @code
	 */
	ejbDirective({
		name: "code",
		priority: 1,
		children: true,
		onChildren: async (ejb, { children }) => {
			return await ejb.compile(children, true);
		},
	}),
	/**
	 * @if Allow to if directive
	 */
	ejbDirective({
		name: "if",
		priority: 1,
		children: true,
		onParams: (_, exp) => {
			return `if (${exp.raw}) {`;
		},
		onEnd: () => "}",
		parents: [
			{
				name: "elseif",
				internal: true,
				onInit: (_, e) => `} else if (${e.raw}) {`,
				onEnd: () => "}",
			},
			{
				name: "elif",
				internal: true,
				onInit: (_, e) => `} else if (${e.raw}) {`,
				onEnd: () => "}",
			},
			{
				name: "else",
				internal: true,
				onInit: () => `else {`,
			},
		],
	}),
	/**
	 * @for directive
	 */
	ejbDirective({
		name: "for",
		priority: 1,
		children: true,
		onInit: (_, exp) => {
			return `for (${exp.raw}) {`;
		},
		onEnd: () => {
			return `}`;
		},
	}),
	/**
	 * @isset directive
	 */
	ejbDirective({
		name: "isset",
		priority: 1,
		onParams(_, exp) {
			return `if(typeof ${exp.raw} !== "undefined" && ${exp.raw}) $ejb.res += ${exp.raw};`;
		},
	}),
	/**
	 * @switch directive
	 */
	ejbDirective({
		name: "switch",
		priority: 1,
		children: true,
		onParams: (_, exp) => {
			return `switch (${exp.raw}) {`;
		},
		parents: [
			{
				name: "case",
				internal: true,
				onInit: (_, exp) => `case ${exp.raw}: {`,
				onEnd: () => ";break;};",
			},
			{
				name: "default",
				internal: true,
				onInit: () => `default: {`,
				onEnd: () => "};",
			},
		],
		onChildren: async () => {
			return "";
		},
		onEnd: () => "}",
	}),
	/**
	 * @once directive
	 */
	ejbDirective({
		name: "once",
		priority: 1,
		children: true,
		onInitFile: () => "$ejb.onces = {};",
		onChildren: async (ejb, opts) => {
			const content = await ejb.compile(opts.children);
			const reference = md5(content);
			return `if(typeof $ejb.onces['${reference}'] == "undefined") {
                $ejb.onces['${reference}'] = true;
                ${content}
                `;
		},
		onEnd: () => "};",
	}),
);
