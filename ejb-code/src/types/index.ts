import type { EjbDirectivePlugin } from "ejb";

export interface EJBConfig {
    package: string;
    url?: string;
    directives: EjbDirectivePlugin[];
    includes?: string[];
}


export interface EnrichedDirective extends EjbDirectivePlugin {
    source_package: string;
    source_url?: string;
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
    original_loc: SourceLocation;
    virtual_start_offset: number;
    virtual_end_offset: number;
}

export interface EmbeddedLanguage {
    content: string;
    source_map: SourceMapEntry[];
}

export interface ProcessedEJB {
    js: EmbeddedLanguage;
    html: EmbeddedLanguage;
}
