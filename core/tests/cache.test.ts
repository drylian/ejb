import { expect, test, describe, spyOn } from "bun:test";
import { Kire } from "../src/index";
import { md5 } from "../src/utils/md5";

describe("Kire Core - Caching & Require", () => {

    test("md5 utility should generate correct hash", () => {
        const hash = md5("hello world");
        expect(hash).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
    });

    test("kire.compileFn should return an AsyncFunction", async () => {
        const kire = new Kire();
        const fn = await kire.compileFn("Hello {{ name }}");
        expect(fn).toBeInstanceOf(Function);
        expect(fn.constructor.name).toBe("AsyncFunction");
        
        const ctx = {
            [Symbol.for('~response')]: "",
            name: "World",
            res: (s: string) => {}, // minimal mock
        };
        // We need a proper context for execution, usually created by kire.render internals
        // But we can test if it compiles without error.
    });

    test("$ctx.require should cache compiled functions", async () => {
        const kire = new Kire();
        
        // Mock resolverFn to simulate file reading
        let callCount = 0;
        kire.resolverFn = async (path) => {
            callCount++;
            return `Called ${callCount}`;
        };

        // Mock a context
        const ctx: any = {
             md5: (s: string) => md5(s)
        };
        
        // Get the require function from global context
        const requireFn = kire.globalContext.get("require");
        expect(requireFn).toBeDefined();

        // First call
        const fn1 = await requireFn("test.kire", ctx, {});
        expect(callCount).toBe(1);
        
        // Execute generated function to check content
        const resCtx1: any = { [Symbol.for('~response')]: "", res: (s: any) => resCtx1[Symbol.for('~response')] += s };
        await fn1(resCtx1);
        expect(resCtx1[Symbol.for('~response')]).toContain("Called 1");

        // Second call - should use cache
        const fn2 = await requireFn("test.kire", ctx, {});
        expect(callCount).toBe(1); // Should still be 1
        expect(fn1).toBe(fn2); // Should be exact same function instance
    });

    test("$ctx.require should recompile if content changes (non-prod)", async () => {
        const kire = new Kire({ cache: false }); // Disable prod cache mode for this test
        
        let content = "Version 1";
        kire.resolverFn = async () => content;

        const ctx: any = { md5: (s: string) => md5(s) };
        const requireFn = kire.globalContext.get("require");

        // First call
        const fn1 = await requireFn("dynamic.kire", ctx, {});
        const resCtx1: any = { [Symbol.for('~response')]: "", res: (s: any) => resCtx1[Symbol.for('~response')] += s };
        await fn1(resCtx1);
        expect(resCtx1[Symbol.for('~response')]).toContain("Version 1");

        // Change content
        content = "Version 2";

        // Second call - should detect change via hash
        const fn2 = await requireFn("dynamic.kire", ctx, {});
        const resCtx2: any = { [Symbol.for('~response')]: "", res: (s: any) => resCtx2[Symbol.for('~response')] += s };
        await fn2(resCtx2);
        expect(resCtx2[Symbol.for('~response')]).toContain("Version 2");
        
        expect(fn1).not.toBe(fn2);
    });

     test("$ctx.require should NOT recompile if content matches hash (non-prod optimization)", async () => {
        const kire = new Kire({ cache: false });
        
        const content = "Same Content";
        let resolverCalls = 0;
        kire.resolverFn = async () => {
            resolverCalls++;
            return content;
        };
        // We mock compileFn to count compilations
        const originalCompileFn = kire.compileFn;
        let compileCalls = 0;
        kire.compileFn = async (c) => {
            compileCalls++;
            return originalCompileFn.call(kire, c);
        };

        const ctx: any = { md5: (s: string) => md5(s) };
        const requireFn = kire.globalContext.get("require");

        await requireFn("static.kire", ctx, {});
        expect(resolverCalls).toBe(1);
        expect(compileCalls).toBe(1);

        await requireFn("static.kire", ctx, {});
        expect(resolverCalls).toBe(2); // Called resolver to check content
        expect(compileCalls).toBe(1); // But hash matched, so NO recompilation
    });
});
