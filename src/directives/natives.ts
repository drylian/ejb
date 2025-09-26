import { ejbDirective } from "../constants";
import { md5, PromiseResolver } from "../utils";

export default Object.assign(
	{},
	/**
	 * @code
	 */
	ejbDirective({
		name: "code",
		priority: 1,
		children: true,
		onChildren: (ejb, { children }) => {
			return ejb.compileNode(children, true);
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
                internal:true,
				onInit: (_, e) => `} else if (${e.raw}) {`,
                onEnd: () => "}"
			},
			{
				name: "else",
                internal:true,
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
				onEnd: () => ";break;}"
			},
			{
				name: "default",
				internal: true,
				onInit: () => `default: {`,
				onEnd: () => "}"
			},
		],
		onChildren: (_, { parents }) => PromiseResolver(_.compileNode(parents)),
		onEnd: () => "}"
	}),
	/**
	 * @isset directive
	 */
	ejbDirective({
		name: "once",
		priority: 1,
		children: true,
		onInitFile: () => "$ejb.onces = {};",
		onChildren: (ejb, opts) => {
			return PromiseResolver(
				ejb.compileNode(opts.children),
				(content: string) => {
					const reference = md5(content);
					return `if(typeof $ejb.onces[\'{${reference}}\'] == "undefined") {
                $ejb.onces[\'{${reference}}\'] = true;
                ${content}
                `;
				},
			);
		},
		onEnd: () => "};",
	}),
);