import { readFileSync } from "node:fs";
import type { IfAsync } from "./types";
import { readFile } from "node:fs/promises";

export const EJBNodeJSResolver = <Async extends boolean = false>(async?: Async) => {
    return (importpath: string) => {
        try {
            const encoding = { encoding: "utf-8" } as const;
            return (async
                ? readFile(importpath, encoding)
                : readFileSync(importpath, encoding)
            ) as IfAsync<Async, string>;
        } catch (e) {
            console.error(`[EJB-IMPORT] Failed to resolve: ${importpath}`, e);
            return (async ? Promise.resolve('') : '') as IfAsync<Async, string>;
        }
    }
}

export const EJBBunResolver = async (importpath: string) => {
    try {
        const file = Bun.file(importpath);
        return await file.exists() ? await file.text() : '';
    } catch (e) {
        console.error(`[EJB-IMPORT] Failed to resolve: ${importpath}`, e);
        return '';
    }
}
