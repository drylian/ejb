// tailwind.test.ts
import { expect, test, describe, beforeEach, mock } from "bun:test";
import { Kire } from "kire";
import KireTailwind from "./src";

// Mock da função compile do Tailwind para evitar dependência do file system e lentidão nos testes
mock.module("tailwindcss", () => ({
  compile: mock(async (css: string, opts?: any) => {
    let processedCSS = css;
    
    // Se for o import padrão
    if (css.includes('@import "tailwindcss"')) {
        processedCSS = processedCSS.replace('@import "tailwindcss";', '/* tailwind base */');
    }

    // Simular processamento básico de @apply
    if (css.includes("@apply")) {
      processedCSS = processedCSS.replace(/@apply\s+([^;]+);/g, (match, classes) => {
        return `/* applied: ${classes} */`;
      });
    }
    
    // Simular processamento de @theme
    if (css.includes("@theme")) {
        processedCSS = processedCSS.replace(/@theme\s*{([^}]*)}/g, (match, content) => {
            return `/* theme: ${content.trim()} */`;
        });
    }

    return {
      build: () => processedCSS,
    };
  })
}));

describe("@Kirejs/Tailwind", () => {
  let kire: Kire;

  beforeEach(() => {
    kire = new Kire();
    kire.plugin(KireTailwind);
  });

  test("directive @tailwind as block with CSS content", async () => {
    const tpl = `
      @tailwind
        .btn { 
          @apply bg-blue-500; 
        }
      @end
      
      <button class="btn">Click me</button>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain("/* applied: bg-blue-500 */");
    expect(clean).toContain("</style>");
    expect(clean).toContain("<button class=\"btn\">Click me</button>");
  });

  test("directive @tailwind as single line with param", async () => {
    const tpl = `
      @tailwind(".btn { color: red; }")
      
      <button class="btn">Click me</button>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain(".btn { color: red; }");
    expect(clean).toContain("</style>");
  });

  test("empty @tailwind directive (defaults)", async () => {
    const tpl = `
      @tailwind
      @end
      <div>Content</div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain("/* tailwind base */");
    expect(clean).toContain("</style>");
    expect(clean).toContain("<div>Content</div>");
  });

  test("@tailwind with CSS content", async () => {
    const tpl = `
      @tailwind
        .card { 
          @apply shadow-md; 
        }
      @end
      
      <div class="card"></div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain("/* applied: shadow-md */");
    expect(clean).toContain("</style>");
  });

  test("tailwind v4 @theme directive support", async () => {
    const tpl = `
      @tailwind
        @theme {
          --color-primary: blue;
        }
      @end
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("/* theme: --color-primary: blue; */");
  });
});