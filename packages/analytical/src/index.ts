import type { KirePlugin } from "kire";
import { AnalyticalCompiler } from "./compiler";
import { AnalyticalParser } from "./parser";
import "./types";

export const KireAnalytical: KirePlugin = {
	name: "@kirejs/analytical",
	options: {},
	load(kire, _opts) {
		// This plugin can be used to automatically set the engine
		kire.parserConstructor = AnalyticalParser;
		kire.compilerConstructor = AnalyticalCompiler;
	},
};

export default KireAnalytical;
export { AnalyticalCompiler } from "./compiler";
export { AnalyticalParser } from "./parser";
