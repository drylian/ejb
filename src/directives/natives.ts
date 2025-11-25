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
		onParams: (ejb, exp) => {
			ejb.builder.add(`const ${exp.raw};`);
		},
	}),
	/**
	 * @let
	 */
	ejbDirective({
		name: "let",
		priority: 1,
		onParams: (ejb, exp) => {
			ejb.builder.add(`let ${exp.raw};`);
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
			ejb.builder.add(await ejb.compile(children, true));
		},
	}),
	/**
	 * @if Allow to if directive
	 */
	ejbDirective({
		name: "if",
		priority: 1,
		children: true,
		onParams: (ejb, exp) => {
			ejb.builder.add(`if (${exp.raw}) {`);
		},
		onEnd: (ejb) => ejb.builder.add("}"),
		parents: [
			{
				name: "elseif",
				internal: true,
				onInit: (ejb, e) => ejb.builder.add(`} else if (${e.raw}) {`),
				onEnd: (ejb) => ejb.builder.add("}"),
			},
			{
				name: "elif",
				internal: true,
				onInit: (ejb, e) => ejb.builder.add(`} else if (${e.raw}) {`),
				onEnd: (ejb) => ejb.builder.add("}"),
			},
			{
				name: "else",
				internal: true,
				onInit: (ejb) => ejb.builder.add(`else {`),
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
		onInit: (ejb, exp) => {
			ejb.builder.add(`for (${exp.raw}) {`);
		},
		onEnd: (ejb) => {
			ejb.builder.add(`}`);
		},
	}),
	/**
	 * @isset directive
	 */
	ejbDirective({
		name: "isset",
		priority: 1,
		onParams(ejb, exp) {
			ejb.builder.add(
				`if(typeof ${exp.raw} !== "undefined" && ${exp.raw}) $ejb.res += ${exp.raw};`,
			);
		},
	}),
	/**
	 * @switch directive
	 */
	ejbDirective({
		name: "switch",
		priority: 1,
		children: true,
		onParams: (ejb, exp) => {
			ejb.builder.add(`switch (${exp.raw}) {`);
		},
		parents: [
			{
				name: "case",
				internal: true,
				onInit: (ejb, exp) => ejb.builder.add(`case ${exp.raw}: {`),
				onEnd: (ejb) => ejb.builder.add(";break;};"),
			},
			{
				name: "default",
				internal: true,
				onInit: (ejb) => ejb.builder.add(`default: {`),
				onEnd: (ejb) => ejb.builder.add("};"),
			},
		],
		onEnd: (ejb) => ejb.builder.add("}"),
	}),
	/**
	 * @once directive
	 */
	ejbDirective({
		name: "once",
		priority: 1,
		children: true,
		onInitFile: (ejb) => ejb.builder.add("$ejb.onces = {};"),
		onChildren: async (ejb, opts) => {
			const content = await ejb.compile(opts.children);
			const reference = md5(content);
			ejb.builder.add(`if(typeof $ejb.onces['${reference}'] == "undefined") {
                $ejb.onces['${reference}'] = true;
                ${content}
                `);
		},
		onEnd: (ejb) => ejb.builder.add("};"),
	}),
);
