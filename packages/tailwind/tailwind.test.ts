// tailwind.test.ts
import { expect, test, describe, beforeEach, mock } from "bun:test";
import { Kire } from "kire";
import KireTailwind from "./src";

// Mock mais realista da função compile do Tailwind
mock.module("tailwindcss", () => ({
  compile: mock(async (css: string, opts?: any) => {
    // Simular o processamento do Tailwind CSS de forma mais realista
    let processedCSS = css;
    
    // Processar @apply directives
    if (css.includes("@apply")) {
      processedCSS = css.replace(/@apply\s+([^;]+);/g, (match, classes) => {
        const rules: string[] = [];
        classes.split(/\s+/).forEach(className => {
          switch (className) {
            case "bg-blue-500":
              rules.push("background-color: #3b82f6");
              break;
            case "text-white":
              rules.push("color: white");
              break;
            case "px-4":
              rules.push("padding-left: 1rem", "padding-right: 1rem");
              break;
            case "py-2":
              rules.push("padding-top: 0.5rem", "padding-bottom: 0.5rem");
              break;
            case "rounded":
              rules.push("border-radius: 0.25rem");
              break;
            case "bg-blue-700":
              rules.push("background-color: #1d4ed8");
              break;
            case "bg-white":
              rules.push("background-color: white");
              break;
            case "shadow-md":
              rules.push("box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)");
              break;
            case "p-6":
              rules.push("padding: 1.5rem");
              break;
            case "rounded-lg":
              rules.push("border-radius: 0.5rem");
              break;
            case "text-xl":
              rules.push("font-size: 1.25rem");
              break;
            case "font-bold":
              rules.push("font-weight: bold");
              break;
            case "text-gray-800":
              rules.push("color: #1f2937");
              break;
            default:
              // Para classes não mapeadas, manter como comentário
              if (className) {
                rules.push(`/* ${className} */`);
              }
          }
        });
        return rules.join("; ") + ";";
      });
    }

    // Manter media queries intactas
    if (css.includes("@media")) {
      processedCSS = css;
    }

    // Manter custom properties intactas
    if (css.includes(":root")) {
      processedCSS = css;
    }

    return {
      sources: [],
      root: null,
      features: 0,
      build: () => processedCSS,
      buildSourceMap: () => ({ 
        file: null, 
        sources: [], 
        mappings: [] 
      })
    };
  })
}));

describe("@Kirejs/Tailwind", () => {
  let kire: Kire;

  beforeEach(() => {
    kire = new Kire();
    kire.plugin(KireTailwind, {
      config: {},
      optimize: { minify: false }
    });
  });

  test("directive @tailwind with CSS content", async () => {
    const tpl = `
      @tailwind(
        .btn { 
          @apply bg-blue-500 text-white px-4 py-2 rounded; 
        }
        .btn:hover { 
          @apply bg-blue-700; 
        }
      )
      
      <button class="btn">Click me</button>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    // Verifica se o estilo foi processado e inserido
    expect(clean).toContain("<style>");
    expect(clean).toContain("</style>");
    expect(clean).toContain("background-color: #3b82f6");
    expect(clean).toContain("color: white");
    expect(clean).toContain("<button class=\"btn\">Click me</button>");
  });

  test("element <tailwind> with CSS content", async () => {
    const tpl = `
      <tailwind>
        .card { 
          @apply bg-white shadow-md p-6 rounded-lg; 
        }
        .card-title { 
          @apply text-xl font-bold text-gray-800; 
        }
      </tailwind>
      
      <div class="card">
        <h1 class="card-title">Hello World</h1>
      </div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain("</style>");
    expect(clean).toContain("background-color: white");
    expect(clean).toContain("<div class=\"card\">");
    expect(clean).toContain("<h1 class=\"card-title\">Hello World</h1>");
  });

  test("element <apply> with Tailwind classes", async () => {
    const tpl = `
      <apply>flex justify-center items-center bg-red-100 p-4
        <span>Centered content</span>
      </apply>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<div class=\"flex justify-center items-center bg-red-100 p-4\">");
    expect(clean).toContain("<span>Centered content</span>");
    expect(clean).toContain("</div>");
  });

  test("combined usage of tailwind features", async () => {
    const tpl = `
      @tailwind(
        @layer components {
          .btn-primary { 
            @apply bg-blue-600 text-white font-bold py-2 px-4 rounded; 
          }
        }
      )
      
      <apply>btn-primary
        Primary Button
      </apply>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("btn-primary");
    expect(clean).toContain("Primary Button");
    expect(clean).toMatch(/<div class="btn-primary">/);
  });

  test("tailwind with layer directives", async () => {
    const tpl = `
      @tailwind(
        @layer base {
          html { font-family: system-ui; }
        }
      )
      
      <div>Test content</div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("<style>");
    expect(clean).toContain("</style>");
    expect(clean).toContain("@layer base");
    expect(clean).toContain("<div>Test content</div>");
  });

  test("tailwind with media queries", async () => {
    const tpl = `
      @tailwind(
        @media (min-width: 768px) {
          .md-grid { display: grid; }
        }
      )
      
      <div class="md-grid">Responsive grid</div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("@media");
    expect(clean).toContain("min-width: 768px");
    expect(clean).toContain("md-grid");
    expect(clean).toContain("<div class=\"md-grid\">Responsive grid</div>");
  });

  test("empty tailwind directive", async () => {
    const tpl = `
      @tailwind()
      <div>Content</div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    // Should handle empty content gracefully
    expect(clean).toContain("<div>Content</div>");
  });

  test("tailwind with custom properties", async () => {
    const tpl = `
      @tailwind(
        :root {
          --primary-color: oklch(63.7% 0.237 25.331);
        }
        .text-primary { color: var(--primary-color); }
      )
      
      <p class="text-primary">Primary text</p>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain(":root");
    expect(clean).toContain("--primary-color");
    expect(clean).toContain("text-primary");
    expect(clean).toContain("<p class=\"text-primary\">Primary text</p>");
  });
});

// Testes de erro e casos edge
describe("@Kirejs/Tailwind - Error cases", () => {
  let kire: Kire;

  beforeEach(() => {
    kire = new Kire();
    kire.plugin(KireTailwind);
  });

  test("handles Tailwind compilation errors gracefully", async () => {
    const tpl = `
      @tailwind(
        .invalid-rule { 
          @apply non-existent-class; 
        }
      )
      
      <div>Fallback content</div>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    // Should still render the content even if CSS has errors
    expect(clean).toContain("<div>Fallback content</div>");
    expect(clean).toContain("<style>");
  });

  test("multiple tailwind directives", async () => {
    const tpl = `
      @tailwind(.header { color: blue; })
      @tailwind(.footer { color: green; })
      
      <header class="header">Header</header>
      <footer class="footer">Footer</footer>
    `;
    
    const result = await kire.render(tpl);
    const clean = result.replace(/\s+/g, ' ').trim();
    
    expect(clean).toContain("header");
    expect(clean).toContain("footer");
    expect(clean).toContain("color: blue");
    expect(clean).toContain("color: green");
  });
});