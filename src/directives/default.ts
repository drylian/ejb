import component from "./component";
import _import from "./import";
import layout from "./layout";
import natives from "./natives";
import css from "./css";
import client from "./client";
import clientHelpers from "./client_helpers";
import assets from "./assets";

/**
 * Basement directives
 */
export const DEFAULT_DIRECTIVES = Object.assign(
	{},
	_import,
	component,
	layout,
	natives,
	css,
	client,
	clientHelpers,
	assets,
);
