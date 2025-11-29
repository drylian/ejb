import type { KirePlugin } from "../types";
import componentDirectives from "./component";
import importDirectives from "./import";
import defineDirectives from "./layout";
import nativeDirectives from "./natives";

export const KireDirectives: KirePlugin = {
	name: "kire",
	sort: 100,
	options: {},
	load(kire) {
		defineDirectives(kire);
		nativeDirectives(kire);
		importDirectives(kire);
		componentDirectives(kire);
	},
};
