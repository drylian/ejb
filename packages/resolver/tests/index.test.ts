import { expect, test, describe, mock, afterEach } from "bun:test";
import { Kire } from "kire";
import KireResolver from "../src/index";
import { join } from "path";

// --- Mocks ---

// Mock fs/promises for Node.js adapter
mock.module('fs/promises', () => ({
    readFile: mock(async (path: string) => {
        if (path.includes('node-template.kire')) return 'Hello from Node!';
        throw new Error('File not found (Node mock)');
    }),
    writeFile: mock(async () => {}),
    rm: mock(async () => {}),
}));

// Mock fetch for 'fetch' adapter
const originalFetch = global.fetch;
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
    
    afterEach(() => {
        mock.restore();
    });

    test("should use 'node' adapter by default", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);
        // Use view() for file resolution
        const content = await kire.view('node-template.kire');
        expect(content).toBe('Hello from Node!');
    });

    test("should use 'bun' adapter when specified and Bun is available", async () => {
        if (typeof Bun === 'undefined') {
            console.warn("Skipping Bun adapter test: Bun runtime not available.");
            return;
        }
        
        // Mock Bun.file for this test
        const originalFile = Bun.file;
        Bun.file = (path: string) => {
            if (path.includes('template.kire')) {
                return {
                    text: async () => '<div> Hello </div>',
                    exists: async () => true,
                } as any;
            }
             return {
                text: async () => '',
                exists: async () => false,
            } as any;
        };

        const kire = new Kire();
        kire.plugin(KireResolver, { adapter: 'bun' });
        
        // Pass the filename without the extension; Kire will resolve it
        const content = await kire.view('template');
        expect(content).toBe('<div> Hello </div>');
        
        // Restore Bun.file
        Bun.file = originalFile;
    });

    test("should throw error for 'deno' adapter when Deno is not available", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver, { adapter: 'deno' });
        // Use view() to trigger resolver
        await expect(kire.view('template.kire')).rejects.toThrow('Deno runtime is not available.');
    });

    test("should use 'fetch' adapter for URLs", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver, { adapter: 'fetch' });
        // Use view() for URL resolution
        const content = await kire.view('http://example.com/template');
        expect(content).toBe('Hello from Fetch!');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('http://example.com/template');
    });

    test("kire.view() should be able to resolve paths via resolver plugin", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);

        const content = await kire.view('node-template.kire', { name: 'World' });
        expect(content).toBe('Hello from Node!');
    });
});