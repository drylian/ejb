export interface EJBParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'any';
    children?: boolean;
}

export interface EJBParent {
    name: string;
    description?: string;
}

export interface EJBDirective {
    name: string;
    description: string;
    children: boolean;
    children_type?: 'html' | 'js' | 'css';
    params?: EJBParameter[];
    parents?: EJBParent[];
}

export interface EJBConfig {
    package: string;
    url?: string;
    directives: EJBDirective[];
}
