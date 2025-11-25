import { ejbDirective } from "../constants";
import type { EjbDirectivePlugin } from "../types";

const fetchDirective: EjbDirectivePlugin = {
    name: 'fetch',
    onParams: (_, exp) => `await $ejb.fetch(${exp.raw})`
};

const elementDirective: EjbDirectivePlugin = {
    name: 'element',
    onParams: (_, exp) => `$ejb.element(${exp.raw})`
};

const clientLoadDirective: EjbDirectivePlugin = {
    name: 'clientLoad',
    onParams: (_, exp) => `$ejb.renderload(${exp.raw})`
};

const refDirective: EjbDirectivePlugin = {
    name: 'ref',
    // This returns a string that becomes an HTML attribute.
    onParams: (_, exp) => `ejb:ref=${exp.getRaw('0')}`
};

const effectDirective: EjbDirectivePlugin = {
    name: 'effect',
    children: true,
    onInit: (ejb: AnyEjb, exp: Expression) => {
        // Capture the expression in a local variable in the generated code
        return `const __effectArgs = ${exp.raw}; $ejb.effect(async () => {`;
    },
    async onChildren(ejb: AnyEjb, { children }: EjbChildrenContext) {
        return await ejb.compile(children, true);
    },
    onEnd: (ejb: AnyEjb) => {
        // Use the captured local variable
        return `}, ...(__effectArgs));`;
    }
};

export default {
    ...ejbDirective(fetchDirective),
    ...ejbDirective(elementDirective),
    ...ejbDirective(clientLoadDirective),
    ...ejbDirective(refDirective),
    ...ejbDirective(effectDirective),
};
