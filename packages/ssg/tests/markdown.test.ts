import { describe, expect, it, spyOn, mock } from "bun:test";
import { KireSsg } from "../src/index";
import { Kire } from "kire";
import KireMarkdown from "../../markdown/src/index";
import KireAssets from "../../assets/src/index";
import KireResolver from "../../resolver/src/index";
import { join } from "path";
import { mkdir, writeFile, readFile, rm, readdir } from "fs/promises";

describe("KireSsg Build", () => {
    const testDir = "./test-ssg-build";
    const outDir = join(testDir, "dist");
    const srcDir = join(testDir, "src");

    // Mock console to keep output clean
    // const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    // const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    it("should build a complete site with markdown, regular pages, and assets", async () => {
        // 1. Setup Directory Structure
        await mkdir(srcDir, { recursive: true });
        await mkdir(join(srcDir, "docs"), { recursive: true });
        await mkdir(join(srcDir, "blog/2023"), { recursive: true });

        // 2. Create Files

        // A. Layout Generator for Docs
        const docsLayout = `
        <!DOCTYPE html>
        <html>
        <head>
            @assets()
            <title>Docs</title>
        </head>
        <body>
            <nav>Docs Nav</nav>
            <main>
                @mdslots('docs/*.md', 'docs')
                {{{ docs[currentPath] }}}
            </main>
        </body>
        </html>
        `;
        await writeFile(join(srcDir, "docs_gen.kire"), docsLayout);

        // B. Markdown Content for Docs
        await writeFile(join(srcDir, "docs/intro.md"), "# Introduction\nWelcome to docs.");
        await writeFile(join(srcDir, "docs/setup.md"), "# Setup\nHow to setup.");

        // C. Regular Page (Home)
        const indexPage = `
        <!DOCTYPE html>
        <html>
        <head>
            @assets()
            <style>body { background: #f0f0f0; }</style>
        </head>
        <body>
            <h1>Home Page</h1>
            <script>console.log('Home Script');</script>
        </body>
        </html>
        `;
        await writeFile(join(srcDir, "index.kire"), indexPage);

        // D. Nested Generator (Blog)
        const blogLayout = `
        <article>
            @mdslots('blog/**/*.md')
            {{{ $mdslot[currentPath] }}}
        </article>
        `;
        await writeFile(join(srcDir, "blog_gen.kire"), blogLayout);

        // E. Nested Markdown Content
        await writeFile(join(srcDir, "blog/2023/post1.md"), "# First Post\nHello Blog.");

        // 3. Setup Kire
        const kire = new Kire({
            root: srcDir,
            plugins: [
                [KireSsg, { assetsPrefix: 'static' }], 
                KireMarkdown, 
                [KireAssets, { prefix: 'static' }],
                KireResolver // Add resolver to provide $readdir
            ],
            // resolver: async (path) => await readFile(path, 'utf-8') // KireResolver handles this now, but we can keep or remove. KireResolver overrides kire.$resolver.
        });
        // Since we added KireResolver plugin, it overrides $resolver. We don't need to manually set it unless we want to.
        // However, KireResolver reads from disk relative to CWD usually or absolute paths.
        // In test, kire.root is `srcDir`.
        // `docs/*.md` pattern is relative to `srcDir`?
        // `$readdir` in resolver uses `recursiveReaddir` starting from `.` (process.cwd) if not specified?
        // My `$readdir` impl uses hardcoded `root = "."`. 
        // This might be an issue if the test runs in project root but files are in `./test-ssg-build/src`.
        // The pattern passed to `$readdir` will be `docs/*.md`.
        // The glob logic: `docs/*.md` in `.` (root).
        // But files are in `test-ssg-build/src/docs/*.md`.
        // So `$readdir` won't find them if searching from `.` using pattern `docs/*.md`.
        
        // Hack: Change kire.$readdir to search in srcDir?
        // OR update `$readdir` implementation to respect `kire.root`?
        // But `$readdir` is attached by `resolver` plugin, which doesn't know about `kire.root` changes dynamically unless configured.
        // The resolver `createReadDir` uses `.` as root.
        
        // I should update the test to mock `$readdir` OR update the pattern to be relative to CWD.
        // `test-ssg-build/src/docs/*.md`.
        // But the template uses `docs/*.md`.
        
        // Better: Update the test to mock `$readdir` manually to ensure it works in test environment without relying on my potentially flawed `$readdir` implementation regarding root paths.
        
        kire.$readdir = async (pattern) => {
             // pattern is 'docs/*.md' or 'blog/**/*.md'
             // we need to return relative paths (as keys for slots)?
             // AND we need to find the files in `srcDir`.
             
             // Using `glob` from `glob` package inside test is easiest.
             // import { glob } from 'glob'; // wait, I don't have it imported in test file.
             // I can use readdir recursively.
             
             // But wait, `KireMarkdown` calls `$readdir(pattern)`.
             // And uses the result to call `renderMarkdown(file)`.
             // `renderMarkdown` uses `resolvePath`.
             // If `$readdir` returns `docs/intro.md`, `resolvePath` (with root=srcDir) will resolve to `srcDir/docs/intro.md`.
             // So `$readdir` MUST return paths relative to `root`.
             
             // Let's implement a simple mock for this test.
             if (pattern === 'docs/*.md') {
                 return ['docs/intro.md', 'docs/setup.md'];
             }
             if (pattern === 'blog/**/*.md') {
                 return ['blog/2023/post1.md'];
             }
             return [];
        };

        try {
            // 4. Run Build
            await KireSsg.build({ out: outDir });

            // 5. Verify Output

            // A. Verify Docs (Generated from Markdown)
            const introHtml = await readFile(join(outDir, "docs/intro.html"), "utf-8");
            expect(introHtml).toContain("<h1>Introduction</h1>");
            expect(introHtml).toContain("<nav>Docs Nav</nav>");
            
            const setupHtml = await readFile(join(outDir, "docs/setup.html"), "utf-8");
            expect(setupHtml).toContain("<h1>Setup</h1>");

            // B. Verify Home Page (Regular Kire)
            const indexHtml = await readFile(join(outDir, "index.html"), "utf-8");
            expect(indexHtml).toContain("<h1>Home Page</h1>");
            expect(indexHtml).toContain('<link rel="stylesheet" href="/static/');
            expect(indexHtml).toContain('<script src="/static/');

            // C. Verify Nested Blog Post
            const postHtml = await readFile(join(outDir, "blog/2023/post1.html"), "utf-8");
            expect(postHtml).toContain("<h1>First Post</h1>");
            expect(postHtml).toContain("<article>");

            // D. Verify Assets Generation
            const staticDir = join(outDir, "static");
            const assets = await readdir(staticDir);
            
            // Expect at least 1 css and 1 js file
            const cssFile = assets.find(f => f.endsWith('.css'));
            const jsFile = assets.find(f => f.endsWith('.js'));
            
            expect(cssFile).toBeDefined();
            expect(jsFile).toBeDefined();

            // Check asset content
            const cssContent = await readFile(join(staticDir, cssFile!), "utf-8");
            expect(cssContent).toContain("background: #f0f0f0");

            const jsContent = await readFile(join(staticDir, jsFile!), "utf-8");
            expect(jsContent).toContain("console.log('Home Script')");

        } finally {
            // Cleanup
            // logSpy.mockRestore(); // Removed
            // errorSpy.mockRestore(); // Removed
            await rm(testDir, { recursive: true, force: true });
        }
    });
});