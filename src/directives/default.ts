import component from "./component";
import _import from "./import";
import layout from "./layout";
import natives from "./natives";

/**
 * Basement directives
 */
export const DEFAULT_DIRECTIVES = Object.assign(
	{},
	_import,
	component,
	layout,
	natives,
);
