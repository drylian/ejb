import { expect, test, mock } from "bun:test";
import { EJBNodeJSResolver, EJBBunResolver } from "../src/resolvers";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";

mock("fs", () => ({
    readFileSync: (path: string) => `content of ${path}`,
}));

mock("fs/promises", () => ({
    readFile: (path: string) => Promise.resolve(`content of ${path}`),
}));

test("should create a sync NodeJS resolver", () => {
    const resolver = EJBNodeJSResolver(false);
    const result = resolver("path/to/file");
    expect(result).toBe("content of path/to/file");
});

test("should create an async NodeJS resolver", async () => {
    const resolver = EJBNodeJSResolver(true);
    const result = await resolver("path/to/file");
    expect(result).toBe("content of path/to/file");
});

test("should handle errors in NodeJS resolver", () => {
    const resolver = EJBNodeJSResolver(false);
    const result = resolver("error/path");
    expect(result).toBe("");
});

test("should resolve with Bun resolver", async () => {
    mock.module("bun", () => ({
        file: (path: string) => ({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve(`content of ${path}`),
        }),
    }));

    const result = await EJBBunResolver("path/to/file");
    expect(result).toBe("content of path/to/file");
});

test("should handle non-existent file in Bun resolver", async () => {
    mock.module("bun", () => ({
        file: (path: string) => ({
            exists: () => Promise.resolve(false),
            text: () => Promise.resolve(`content of ${path}`),
        }),
    }));

    const result = await EJBBunResolver("non-existent/path");
    expect(result).toBe("");
});
