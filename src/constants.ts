/**
 * Regular expression for detecting characters that need HTML escaping
 */
import type { EjbDirectivePlugin } from "./types";

/**
 * Default prefix for global variables in templates
 */
export const EJB_DEFAULT_PREFIX_GLOBAL = "it";

/**
 * Default prefix for directives in templates
 */
export const EJB_DEFAULT_PREFIX_DIRECTIVE = "@";

/**
 * Escaped prefix for directives in templates (e.g., @@directive)
 */
export const EJB_ESCAPED_PREFIX_DIRECTIVE = "@@";

/**
 * Default prefix for variable interpolation in templates
 * Uses {{*}} syntax where * represents the variable name
 */
export const EJB_DEFAULT_PREFIX_VARIABLE = "{{*}}";

/**
 * HTML escape character mappings
 */
export const ESCAPE_HTML = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/**
 * Regular expression for detecting characters that need HTML escaping
 */
export const ESPACE_HTML_REGEX = /[&<>"'']/g;

/**
 * Regular expression for html codes
 */
export const HTML_REGULAR_REGEX = /<[a-z][\s\S]*>/i;

/**
 * Regular expression for parsing directive syntax:
 * - Captures directive name
 * - Optionally captures parameters in parentheses
 */
export const DIRECTIVE_REGEX = /^\s*([a-zA-Z0-9]+)(?:\s*\(([\s\S]*?)\))?/; // Changed to match only one @

/**
 * Enum representing different AST node types in the template engine
 */
export enum EjbAst {
	/** Root node of the AST */
	Root,
	/** Text content node */
	Text,
	/** Variable interpolation node */
	Interpolation,
	/** Directive node */
	Directive,
	/** Sub-directive node */
	SubDirective,
}

/**
 * Helper function to create a directive plugin object
 * @param opts - Directive plugin object
 * @returns An object with the directive name as key and options as value
 */
export function ejbDirective(
	opts: EjbDirectivePlugin,
): Record<string, EjbDirectivePlugin> {
	return {
		[opts.name.toString()]: opts,
	};
}
