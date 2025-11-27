import type { KirePlugin, Kire } from 'kire';
import { AnalyticalParser } from './parser';
import { AnalyticalCompiler } from './compiler';
import './types';

export const KireAnalytical:KirePlugin = {
    name:"@kirejs/analytical",
    options:{},
    load(kire, opts) {
        // This plugin can be used to automatically set the engine
        kire.parserConstructor = AnalyticalParser;
        kire.compilerConstructor = AnalyticalCompiler;
    },
}

export default KireAnalytical;
export { AnalyticalParser } from './parser';
export { AnalyticalCompiler } from './compiler';