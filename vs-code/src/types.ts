export interface EJBConfig {
    package: string;
    url?: string;
    directives: Directive[];
    includes?: string[];
}

export interface Directive {
    name: string;
    description: string;
    children: boolean;
    children_type?: 'html' | 'js' | 'css';
    params?: Param[];
    parents?: Parent[];
}

export interface EnrichedDirective extends Directive {
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
