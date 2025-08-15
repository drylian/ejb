import { ESCAPE_HTML, ESPACE_HTML_REGEX } from "./constants";
import type { AnyEjb } from "./types";

export const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
export function escapeRegExp(string: string) {
    // From MDN
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
}

export function returnEjbRes(ejb: AnyEjb, str: string) {
    return `(${ejb.async ? "await" : ''}(${ejb.async ? 'async' : ''}($ejb) => {${str}; return $ejb.res})({...$ejb, res:''}))`;
}

export function PromiseResolver<Input, Output = Input>(
    data: Input | Promise<Input>,
    ...transformers: Array<(value: any) => any>
): Output | Promise<Output> {
    const apply = (value: any, index = 0): any => {
        if (index >= transformers.length) return value;
        const transformed = transformers[index](value);
        return isPromise(transformed)
            ? transformed.then(v => apply(v, index + 1))
            : apply(transformed, index + 1);
    };

    return isPromise(data)
        ? data.then(v => apply(v))
        : apply(data);
}

export function join(...segments: string[]): string {
    if (!segments.length) return '.';

    const windowsAbsoluteRegex = /^[a-zA-Z]:[\\/]/;
    const isWindowsAbsolute = segments.some(s => windowsAbsoluteRegex.test(s));
    const driveLetter = isWindowsAbsolute
        ? segments.find(s => windowsAbsoluteRegex.test(s))?.charAt(0).toUpperCase()
        : null;

    let normalized = segments
        .map(s => s.replace(/\\/g, '/').replace(/\/+/g, '/'))
        .join('/')
        .replace(/\/+/g, '/');

    if (isWindowsAbsolute && driveLetter) {
        normalized = normalized.replace(/^[a-zA-Z]:/, driveLetter);
    }
    const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(normalized);

    const parts = normalized
        .split('/')
        .filter(part => part && part !== '.')
        .reduce((acc, part) => {
            return part === '..'
                ? (acc.length && acc[acc.length - 1] !== '..')
                    ? acc.slice(0, -1)
                    : [...acc, part]
                : [...acc, part];
        }, [] as string[]);

    let path = parts.join('/');

    if (isWindowsAbsolute) {
        path = path.replace(/^([a-zA-Z]:)/, (_, drive) => `${drive.toUpperCase()}/`)
            .replace(/^\//, `${driveLetter}:/`)
            .replace(/\//g, '\\');

        path = path.replace(/\\+/g, '\\');
        return path || '.';
    }

    if (isAbsolute) path = '/' + path.replace(/^\//, '');
    if (path === '') return '.';

    return path;
}

export const filepathResolver = (ejb: AnyEjb, filepath: string, currentFile?: string): string => {
    if (!filepath) return filepath;

    filepath = filepath.replace(/\\/g, '/').replace(/\/+/g, '/');
    const root = (ejb.root || '.').replace(/\\/g, '/').replace(/\/$/, '');

    const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(filepath);

    const aliasMatch = Object.entries(ejb.aliases)
        .sort(([a], [b]) => b.length - a.length)
        .find(([alias]) => new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(filepath));

    if (aliasMatch) {
        const [alias, replacement] = aliasMatch;
        filepath = join(replacement, filepath.slice(alias.length));
    } else if (!isAbsolute) {
        const base = currentFile ? currentFile.replace(/\/[^/]*$/, '') : root;
        filepath = join(base, filepath);
    }

    if (ejb.extension && !/\.[^/.]+$/.test(filepath)) {
        const ext = ejb.extension.startsWith('.') ? ejb.extension : `.${ejb.extension}`;
        filepath = filepath + ext;
    }

    return filepath.replace(/\/+/g, '/');
};

export const escapeJs = (str: string) => str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

export function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return String(Math.abs(hash));
}

export function generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${random}`.toLowerCase();
}

export function escapeHtml(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(
        ESPACE_HTML_REGEX,
        (match) => ESCAPE_HTML[match as keyof typeof ESCAPE_HTML]
    );
}

export function isPromise<T>(p: any): p is Promise<T> {
    return p !== null && typeof p === 'object' && typeof p.then === 'function';
}