import { expect, test, describe, spyOn, it } from "bun:test";
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

	it("$ctx.require should cache compiled functions", async () => {
		const kire = new Kire({ production: true });
		const requireFn = kire.$globals.get("$require");
		const ctx: any = { $md5: (s: string) => md5(s) };

		let callCount = 0;
		kire.$resolver = async (path) => {
			callCount++;
			return `Called ${callCount}`;
		};

		// First call
		const fn1 = await requireFn("test.kire", ctx, {});
		expect(callCount).toBe(1);

		// Execute generated function to check content
		const resCtx1: any = { "~res": "", res: function(s: any) { this['~res'] += s; } };
		await fn1(resCtx1);
		expect(resCtx1["~res"]).toContain("Called 1");

		// Second call (should be cached)
		const fn2 = await requireFn("test.kire", ctx, {});
		expect(callCount).toBe(1); // Should still be 1
		expect(fn1).toBe(fn2); // Same function instance
	});

	it("$ctx.require should recompile if content changes (non-prod)", async () => {
		const kire = new Kire({ production: false });
		const requireFn = kire.$globals.get("$require");
		const ctx: any = { $md5: (s: string) => md5(s) };

		let content = "Version 1";
		kire.$resolver = async () => content;

		// First call
		const fn1 = await requireFn("dynamic.kire", ctx, {});
		const resCtx1: any = { "~res": "", res: function(s: any) { this['~res'] += s; } };
		await fn1(resCtx1);
		expect(resCtx1["~res"]).toContain("Version 1");

		// Change content
		content = "Version 2";

		// Second call
		const fn2 = await requireFn("dynamic.kire", ctx, {});
		const resCtx2: any = { "~res": "", res: function(s: any) { this['~res'] += s; } };
		await fn2(resCtx2);
		expect(resCtx2["~res"]).toContain("Version 2");

		expect(fn1).not.toBe(fn2);
	});

     test("$ctx.require should NOT recompile if content matches hash (non-prod optimization)", async () => {
        const kire = new Kire({ production: false });
        
        const content = "Same Content";
        let resolverCalls = 0;
        kire.$resolver = async () => {
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

        const ctx: any = { $md5: (s: string) => md5(s) };
        const requireFn = kire.$globals.get("$require");

        await requireFn("static.kire", ctx, {});
        expect(resolverCalls).toBe(1);
        expect(compileCalls).toBe(1);

        await requireFn("static.kire", ctx, {});
        expect(resolverCalls).toBe(2); // Called resolver to check content
        expect(compileCalls).toBe(1); // But hash matched, so NO recompilation
    });
});
