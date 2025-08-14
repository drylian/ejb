import { existsSync, readFileSync } from "node:fs";
import type { IfAsync } from "./types";
import { join } from "./utils";
import { readFile } from "node:fs/promises";

export const EJBNodeJSResolver = <Async extends boolean = false>(
    viewspath: string = "./",
    async?: Async) => {
    return (importpath: string) => {
        const filepath = join(viewspath, importpath);
        if (!existsSync(filepath)) {
            console.error(`[EJB-IMPORT]: ${filepath} not found.`)
            return '' as IfAsync<Async, string>;
        }
        const encoding = {
            encoding: "utf-8"
        } as const;
        return (async
            ? readFile(filepath, encoding)
            : readFileSync(filepath, encoding)
        ) as IfAsync<Async, string>;
    }
}

/**
 * Bun.file resolver, only async method
 */
export const EJBBunResolver = (
    viewspath: string = "./") => {
    return async (importpath: string) => {
        const filepath = join(viewspath, importpath);
        const file = Bun.file(filepath);
        if (!file.exists()) {
            console.error(`[EJB-IMPORT]: ${filepath} not found.`)
            return '';
        }

        return await file.text();
    }
}



