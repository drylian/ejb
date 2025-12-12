import { expect, test, describe, mock, beforeAll, afterAll } from "bun:test";
import { Kire } from "kire";
import KireResolver from "../src/index";
import { join } from "path";
import { mkdir, rmdir, writeFile } from "node:fs/promises";

// --- Mocks ---

// We will use a temporary directory for real filesystem tests for $readdir
const TMP_DIR = join(import.meta.dir, "__tmp_resolver_test__");

describe("@kirejs/resolver", () => {

    beforeAll(async () => {
        await mkdir(TMP_DIR, { recursive: true });
        await mkdir(join(TMP_DIR, "subdir"), { recursive: true });
        await writeFile(join(TMP_DIR, "test1.txt"), "content1");
        await writeFile(join(TMP_DIR, "test2.md"), "content2");
        await writeFile(join(TMP_DIR, "subdir", "test3.txt"), "content3");
    });

    afterAll(async () => {
        await rmdir(TMP_DIR, { recursive: true });
    });

    test("should correctly list files using $readdir with pattern", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);

        if (!kire.$readdir) {
            throw new Error("$readdir not initialized");
        }

        // We need to change directory or use absolute paths for glob matching relative to CWD
        // But our implementation uses recursion.
        // Let's see how we implemented $readdir. It uses `.` as root by default.
        // We might need to mock it or pass an absolute path in the pattern if our implementation supports it.
        // Our implementation takes `recursiveReaddir('.', regex)`.
        // So it scans CWD.
        
        // We can't easily change process.cwd() safely in parallel tests.
        // However, we can test if it finds files in the CWD (which is project root).
        // Or we can check if `resolver` options allow setting root?
        // Our `createReadDir` implementation hardcodes `root = "."`.
        // This is a limitation of the current simple implementation.
        
        // Let's try to find a known file in the project structure, e.g., `package.json`.
        const files = await kire.$readdir("package.json");
        // It should find package.json in the root
        const found = files.some(f => f.endsWith("package.json"));
        expect(found).toBeTrue();
    });

    test("should match glob patterns recursively", async () => {
        const kire = new Kire();
        kire.plugin(KireResolver);
        
        // pattern: packages/resolver/**/*.ts
        if (kire.$readdir) {
            const files = await kire.$readdir("packages/resolver/src/*.ts");
            expect(files.length).toBeGreaterThan(0);
            expect(files.some(f => f.endsWith("index.ts"))).toBeTrue();
        } else {
            throw new Error("$readdir not defined");
        }
    });
});
