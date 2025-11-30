import { expect, test, describe, beforeEach, mock } from "bun:test";
import { Kire } from "kire";
import KireTailwind from "./src";

const mockConfig = {
    theme: {
        extend: {
            colors: {
                brand: 'blue',
            }
        }
    }
};

const compileMock = mock(async (css: string, opts?: any) => {
    let processedCSS = css;

    if (css.includes('@import "tailwindcss"')) {
        processedCSS = processedCSS.replace('@import "tailwindcss";', '/* tailwind base */');
    }
    if (css.includes('@plugin "daisyui"')) {
        processedCSS = processedCSS.replace('@plugin "daisyui";', '/* daisyui plugin */');
    }
    if (css.includes("@apply")) {
      processedCSS = processedCSS.replace(/@apply\s+([^;]+);/g, (match, classes) => `/* applied: ${classes} */`);
    }
    if (css.includes("@theme")) {
        processedCSS = processedCSS.replace(/@theme\s*{([^}]*)}/g, (match, content) => `/* theme: ${content.trim()} */`);
    }
    if (css.includes('@plugin "@tailwindcss/typography"')) {
        processedCSS = processedCSS.replace('@plugin "@tailwindcss/typography";', '/* @tailwindcss/typography plugin */');
        processedCSS += `.prose h1 { font-size: 2em; }`; // Example output
    }


    return {
      build: (candidates: string[]) => {
        let finalCSS = processedCSS;
        if (opts?.config?.theme?.extend?.colors?.brand && candidates.includes('bg-brand')) {
            finalCSS += ` .bg-brand { background-color: ${opts.config.theme.extend.colors.brand}; }`;
        }
        return finalCSS;
      },
    };
});

// Mock da função compile do Tailwind
mock.module("tailwindcss", () => ({
  compile: compileMock,
}));

// Mock para loadModule

const mockLoadModule = mock(async (id: string) => {

    if (id === 'daisyui') {

        return {

            path: '/fake/path/node_modules/daisyui',

            base: '/fake/path/node_modules',

            module: { handler: () => {} }, // Mock plugin

        }

    }

    if (id === '@tailwindcss/typography') {

        return {

            path: '/fake/path/node_modules/@tailwindcss/typography',

            base: '/fake/path/node_modules',

            module: { handler: ({ addPlugin }) => addPlugin(() => { /* do nothing */ }) }, // Mock plugin

        }

    }

    throw new Error(`Module not found: ${id}`);

});



// Mock for tailwindcss/plugin

mock.module('tailwindcss/plugin', () => ({

  handler: mock(() => {}), // Just a dummy handler

  addVariant: mock(() => {}),

}));





describe("@Kirejs/Tailwind", () => {

  

  test("should load tailwind.config.ts and process custom utilities", async () => {

    const kire = new Kire();

    kire.plugin(KireTailwind, { config: mockConfig } as any);



    const tpl = `

      @tailwind

      @end

      <div class="bg-brand"></div>

    `;

    const result = await kire.render(tpl);

    const clean = result.replace(/\s+/g, ' ').trim();

    

    expect(clean).toContain(".bg-brand { background-color: blue; }");

  });



  test('should use cache on second render', async () => {

    // Enable cache for Kire instance

    const kire = new Kire({ cache: true });

    kire.plugin(KireTailwind, { loadModule: mockLoadModule } as any);



    const tpl = `

        @tailwind

            .btn { @apply bg-blue-500; }

        @end

    `;



    // Reset mock calls before test

    compileMock.mockClear();

    

    // First render

    await kire.render(tpl);

    expect(compileMock.mock.calls.length).toBe(1);



    // Second render

    await kire.render(tpl);

    // Should not be called again because the content is cached

    expect(compileMock.mock.calls.length).toBe(1);

  });



  // Other tests

  let kire: Kire;

  beforeEach(() => {

    kire = new Kire();

    kire.plugin(KireTailwind, { loadModule: mockLoadModule } as any);

  });



  test("should handle @plugin rule", async () => {

    const tpl = `

      @tailwind

        @plugin "daisyui";

      @end

    `;

    

    const result = await kire.render(tpl);

    const clean = result.replace(/\s+/g, ' ').trim();

    

    expect(clean).toContain("<style>");

    expect(clean).toContain("/* tailwind base */");

    expect(clean).toContain("/* daisyui plugin */");

    expect(clean).toContain("</style>");

  });



  test("should handle @plugin with @tailwindcss/typography", async () => {

    const tpl = `

      @tailwind

        @plugin "@tailwindcss/typography";

      @end

      <div class="prose"></div>

    `;



    // Mock compileMock to produce some typography-like output

    compileMock.mockImplementation(async (css: string, opts?: any) => {

        let processedCSS = css;

        if (css.includes('@plugin "@tailwindcss/typography"')) {

            processedCSS = processedCSS.replace('@plugin "@tailwindcss/typography";', '/* @tailwindcss/typography plugin */');

            processedCSS += `.prose h1 { font-size: 2em; }`; // Example output

        }

        return { build: () => processedCSS };

    });

    

    const result = await kire.render(tpl);

    const clean = result.replace(/\s+/g, ' ').trim();

    

    expect(clean).toContain("<style>");

    expect(clean).toContain("/* @tailwindcss/typography plugin */");

    expect(clean).toContain(".prose h1 { font-size: 2em; }");

    expect(clean).toContain("</style>");

    expect(clean).toContain('<div class="prose"></div>');

  });

});