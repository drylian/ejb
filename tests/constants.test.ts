import { expect, test } from "bun:test";
import {
	DIRECTIVE_REGEX,
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_GLOBAL,
	EJB_DEFAULT_PREFIX_VARIABLE,
	ESCAPE_HTML,
	ESPACE_HTML_REGEX,
	ejbDirective,
} from "../src/constants";
import type { EjbDirectivePlugin } from "../src/types";

test("should return default prefixes", () => {
	expect(EJB_DEFAULT_PREFIX_GLOBAL).toBe("it");
	expect(EJB_DEFAULT_PREFIX_DIRECTIVE).toBe("@");
	expect(EJB_DEFAULT_PREFIX_VARIABLE).toBe("{{*}}");
});

test("should return HTML escape characters", () => {
	expect(ESCAPE_HTML).toEqual({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	});
});

test("should return regex for HTML escape", () => {
	expect(ESPACE_HTML_REGEX).toEqual(/[&<>"'']/g);
});

test("should return regex for directive", () => {
	expect(DIRECTIVE_REGEX).toEqual(/^\s*([a-zA-Z0-9]+)(?:\s*\(([\s\S]*?)\))?/);
});

test("should create a directive plugin", () => {
	const directive: EjbDirectivePlugin = {
		name: "custom",
		children: true,
	};
	expect(ejbDirective(directive)).toEqual({
		custom: directive,
	});
});
