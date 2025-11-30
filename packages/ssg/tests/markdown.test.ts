import { describe, expect, it, spyOn, mock } from "bun:test";
import { KireSsg } from "../src/index";
import { Kire } from "kire";
import KireMarkdown from "../../markdown/src/index";
import KireAssets from "../../assets/src/index";
import { join } from "path";
import { mkdir, writeFile, readFile, rm, readdir } from "fs/promises";

describe("KireSsg Build", () => {
    const testDir = "./test-ssg-build";
    const outDir = join(testDir, "dist");
    const srcDir = join(testDir, "src");

    // Mock console to keep output clean
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

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
                @markdown('docs/*.md')
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
            @markdown('blog/**/*.md')
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
                [KireAssets, { prefix: 'static' }]
            ],
            resolver: async (path) => await readFile(path, 'utf-8')
        });

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
            logSpy.mockRestore();
            errorSpy.mockRestore();
            await rm(testDir, { recursive: true, force: true });
        }
    });
});