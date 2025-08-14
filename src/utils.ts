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
export function join(...segments: string[]) {
    let path = segments.join('/');

    const parts = [];

    const splitPath = path.split('/');

    for (let part of splitPath) {
        if (part === '' || part === '.') continue;

        if (part === '..') {
            if (parts.length > 0) {
                parts.pop();
            }
            continue;
        }

        parts.push(part);
    }

    path = parts.join('/');

    if (segments[0]?.startsWith('/') && !path.startsWith('/')) {
        path = '/' + path;
    }

    const isWindowsPath = segments.some(segment => segment.includes('\\'));
    if (isWindowsPath) {
        path = path.replace(/\//g, '\\');
    }

    return path || '.';
}

export const escapeJs = (str: string) => str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

export const filepathResolver = (ejb: AnyEjb, filepath: string) => {
    // normalize filepath
    filepath = filepath.replace(/\\/g, '/');

    // This avoids problems when one alias is a prefix of another. (e.j: '@' and '@components')
    const aliases = Object.entries(ejb.aliases)
        .sort(([a], [b]) => b.length - a.length);

    for (const [alias, replacement] of aliases) {
        if (filepath.startsWith(alias)) {
            filepath = replacement + filepath.slice(alias.length);
            break;
        }
    }

    if (ejb.extension && !filepath.endsWith(ejb.extension)) {
        const lastDotIndex = filepath.lastIndexOf('.');
        const lastSlashIndex = filepath.lastIndexOf('/');

        if (lastDotIndex > lastSlashIndex) {
            filepath = filepath.slice(0, lastDotIndex);
        }

        filepath += ejb.extension.startsWith('.') ? ejb.extension : `.${ejb.extension}`;
    }

    return filepath;
};


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