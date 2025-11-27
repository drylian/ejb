import type { KirePlugin } from '../types';

import defineDirectives from './layout';
import nativeDirectives from './natives';
import importDirectives from './import';
import componentDirectives from './component';

export const KireDirectives: KirePlugin = {
    name: 'kire',
    options:{},
    load(kire) {
        defineDirectives(kire);
        nativeDirectives(kire);
        importDirectives(kire);
        componentDirectives(kire);
    }
};

