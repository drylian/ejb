import type { EjbDirectivePlugin } from "ejb";

export interface EJBConfig {
    package: string;
    url?: string;
    directives: EjbDirectivePlugin[];
    includes?: string[];
}

export interface EnrichedDirective extends EjbDirectivePlugin {
    sourcePackage: string;
    sourceUrl?: string;
}

export interface Param {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'any';
    children?: boolean;
}

export interface Parent {
    name: string;
    description?: string;
}

import type { SourceLocation } from "ejb";

export interface SourceMapEntry {
    originalLoc: SourceLocation;
    virtualStartOffset: number;
    virtualEndOffset: number;
}

export interface EmbeddedLanguage {
    content: string;
    sourceMap: SourceMapEntry[];
}

export interface ProcessedEJB {
    js: EmbeddedLanguage;
    html: EmbeddedLanguage;
}
