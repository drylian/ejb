import { expect, test, describe, mock } from "bun:test";
import { Kire } from "kire";
import KireResolver from "../src/index";
import { join } from "path";

// --- Mocks ---

// Mock fs/promises for Node.js adapter
// Note: We are mocking the entire module.
// The real `writeFile` and `rm` are replaced with mocks.
// This is okay for the test logic but means we can't use them to create physical files for other tests.
mock.module('fs/promises', () => ({
    readFile: mock(async (path: string) => {
        if (path === 'node-template.kire') return 'Hello from Node!';
        throw new Error('File not found (Node mock)');
    }),
    writeFile: mock(async () => {}),
    rm: mock(async () => {}),
}));

// Mock fetch for 'fetch' adapter
// @ts-ignore
global.fetch = mock(async (url: string) => {
    if (url === 'http://example.com/template') {
        return { 
            ok: true,
            statusText: 'OK',
            text: async () => 'Hello from Fetch!',
        };
    }
    return { ok: false, statusText: 'Not Found' };
});

describe("@kirejs/resolver", () => {

    test("should use 'node' adapter by default", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);
        const content = await kire.render('node-template.kire');
        expect(content).toBe('Hello from Node!');
    });

    test("should use 'bun' adapter when specified and Bun is available", async () => {
        if (typeof Bun === 'undefined') {
            console.warn("Skipping Bun adapter test: Bun runtime not available.");
            return;
        }
        const kire = new Kire({
            // Set the root to the test directory so it can find the temp file
            root: join(import.meta.dir, '..'),
        });
        kire.plugin(KireResolver, { adapter: 'bun' });
        
        // Pass the filename without the extension; Kire will resolve it
        const content = await kire.render('template');
        expect(content).toBe('<div> Hello </div>');
    });

    test("should throw error for 'deno' adapter when Deno is not available", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver, { adapter: 'deno' });
        await expect(kire.render('template.kire')).rejects.toThrow('Deno runtime is not available.');
    });

    test("should use 'fetch' adapter for URLs", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver, { adapter: 'fetch' });
        const content = await kire.render('http://example.com/template');
        expect(content).toBe('Hello from Fetch!');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('http://example.com/template');
    });

    test("kire.view() should be an alias for kire.render()", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);

        // Manually mock kire.render for this test
        const originalRender = kire.render;
        const mockRender = mock(async (template: string, locals: Record<string, any> = {}) => {
            return originalRender.call(kire, template, locals); 
        });
        kire.render = mockRender;

        await (kire as any).view('node-template.kire', { name: 'World' });

        expect(mockRender).toHaveBeenCalledTimes(1);
        expect(mockRender).toHaveBeenCalledWith('node-template.kire', { name: 'World' });
        
        kire.render = originalRender; // Restore original render
    });
});
