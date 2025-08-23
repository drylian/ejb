import type { AnyEjb } from "../types";

/**
 * Reference to the AsyncFunction constructor
 */
export const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export function trimQuotes(str: string) {
	if (typeof str !== "string") return str;
	return str.replace(/^['"`]+|['"`]+$/g, "").trim();
}

/**
 * Wraps template code in an Ejb function wrapper
 * @param ejb - The Ejb instance
 * @param str - The code string to wrap
 * @returns Wrapped function code
 */
export function returnEjbRes(ejb: AnyEjb, str: string): string {
	return `(${ejb.async ? "await" : ""}(${ejb.async ? "async" : ""}($ejb) => {${str}; return $ejb.res})({...$ejb, res:''}))`;
}
