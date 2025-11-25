import { ejbDirective } from "../constants";
import type {
	EjbChildrenContext,
	EjbDirectivePlugin,
} from "../types";

const fetchDirective: EjbDirectivePlugin = {
	name: "fetch",
	onParams: (ejb, exp) => {
		ejb.builder.add(`await $ejb.fetch(${exp.raw})`);
	},
};

const elementDirective: EjbDirectivePlugin = {
	name: "element",
	onParams: (ejb, exp) => {
		ejb.builder.add(`$ejb.element(${exp.raw})`);
	},
};

const clientLoadDirective: EjbDirectivePlugin = {
	name: "clientLoad",
	onParams: (ejb, exp) => {
		ejb.builder.add(`$ejb.renderload(${exp.raw})`);
	},
};

const refDirective: EjbDirectivePlugin = {
	name: "ref",
	// This returns a string that becomes an HTML attribute.
	onParams: (ejb, exp) => {
		ejb.builder.add(`ejb:ref="${exp.getRaw("0")}"`);
	},
};

const effectDirective: EjbDirectivePlugin = {
	name: "effect",
	children: true,
	onInit: (ejb, exp) => {
		// Capture the expression in a local variable in the generated code
		ejb.builder.add(`const __effectArgs = ${exp.raw}; $ejb.effect(async () => {`);
	},
	async onChildren(ejb, { children }: EjbChildrenContext) {
		ejb.builder.add(await ejb.compile(children, true));
	},
	onEnd: (ejb) => {
		// Use the captured local variable
		ejb.builder.add(`}, ...(__effectArgs));`);
	},
};

export default {
	...ejbDirective(fetchDirective),
	...ejbDirective(elementDirective),
	...ejbDirective(clientLoadDirective),
	...ejbDirective(refDirective),
	...ejbDirective(effectDirective),
};
