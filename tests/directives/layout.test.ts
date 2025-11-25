import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../../src/ejb";
import { EJBNodeJSResolver } from "../../src/resolvers";

const pwd = process.cwd();

const createEjbInstance = () =>
	new Ejb({
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

describe("Push and Stack Directives", () => {
  let ejb: Ejb;

  beforeEach(() => {
    ejb = createEjbInstance();
  });

  // Teste básico
  test("should handle basic push and stack", async () => {
    const template = `@stack('test') @push('test')<div>Only Test</div>@end`;
    const result = await ejb.render(template);
    expect(result).toContain("<div>Only Test</div>");
  });

  // Teste com múltiplos push para a mesma stack
  test("should handle multiple pushes to same stack", async () => {
    const template = `
      @stack('scripts')
      @push('scripts')<script src="jquery.js"></script>@end
      @push('scripts')<script src="app.js"></script>@end
    `;
    
    const result = await ejb.render(template);
    expect(result).toContain('<script src="jquery.js"></script>');
    expect(result).toContain('<script src="app.js"></script>');
    expect(result.indexOf('jquery.js')).toBeLessThan(result.indexOf('app.js'));
  });

  // Teste com stacks diferentes
  test("should handle multiple different stacks", async () => {
    const template = `
      @stack('styles')
      @stack('scripts')
      @push('styles')<style>.test { color: red; }</style>@end
      @push('scripts')<script>console.log('test');</script>@end
    `;
    
    const result = await ejb.render(template);
    expect(result).toContain('<style>.test { color: red; }</style>');
    expect(result).toContain("<script>console.log('test');</script>");
  });

  // Teste com stack vazio
  test("should handle empty stack", async () => {
    const template = `@stack('empty')`;
    const result = await ejb.render(template);
    expect(result.trim()).toBe("");
  });

  // Teste com conteúdo complexo
  test("should handle complex content with variables", async () => {
    const context = { title: "My Page", items: [1, 2, 3] };
    const template = `
      @stack('content')
      @push('content')
        <h1>{{ it.title }}</h1>
        <ul>
          @for(const item of it.items)
            <li>Item {{ item }}</li>
          @end
        </ul>
      @end
    `;
    
    const result = await ejb.render(template, context);
    expect(result).toContain("<h1>My Page</h1>");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
    expect(result).toContain("<li>Item 3</li>");
  });

  // Teste com push aninhado em condicionais
  test("should handle push inside conditionals", async () => {
    const context = { showExtra: true };
    const template = `
      @stack('content')
      @if(it.showExtra)
        @push('content')<div class="extra">Extra Content</div>@end
      @end
      @push('content')<div class="main">Main Content</div>@end
    `;
    
    const result = await ejb.render(template, context);
    expect(result).toContain('<div class="extra">Extra Content</div>');
    expect(result).toContain('<div class="main">Main Content</div>');
  });

  // Teste com push em loops
  test("should handle push inside loops", async () => {
    const context = { items: ['a', 'b', 'c'] };
    const template = `
      @stack('list')
      @for(const $item of it.items)
        @push('list')<li>{{ $item }}</li>@end
      @end
    `;
    
    const result = await ejb.render(template, context);
    expect(result).toContain('<li>a</li>');
    expect(result).toContain('<li>b</li>');
    expect(result).toContain('<li>c</li>');
  });

  // Teste de ordem de renderização
  test("should maintain push order", async () => {
    const template = `
      @stack('items')
      @push('items')<div>First</div>@end
      @push('items')<div>Second</div>@end
      @push('items')<div>Third</div>@end
    `;
    
    const result = await ejb.render(template);
    const firstIndex = result.indexOf('First');
    const secondIndex = result.indexOf('Second');
    const thirdIndex = result.indexOf('Third');
    
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });

  // Teste com stack em múltiplos lugares
  test("should handle same stack in multiple places", async () => {
    const template = `
      @stack('partial')
      @push('partial')<div>Part 1</div>@end
      @stack('partial')
      @push('partial')<div>Part 2</div>@end
    `;
    
    const result = await ejb.render(template);
    expect(result).toContain('<div>Part 1</div>');
    expect(result).toContain('<div>Part 2</div>');
    expect((result.match(/Part 1/g) || []).length).toBe(2);
    expect((result.match(/Part 2/g) || []).length).toBe(1);
  });

  // Teste com conteúdo HTML complexo
  test("should handle complex HTML content", async () => {
    const template = `
      @stack('modal')
      @push('modal')
        <div class="modal" data-id="test-modal">
          <div class="modal-content">
            <h2>Title</h2>
            <p>Content with "quotes" and 'apostrophes'</p>
            <button onclick="console.log('clicked')">Click</button>
          </div>
        </div>
      @end
    `;
    
    const result = await ejb.render(template);
    expect(result).toContain('class="modal"');
    expect(result).toContain('data-id="test-modal"');
    expect(result).toContain("onclick=\"console.log('clicked')\"");
  });

  // Teste de performance com muitos pushes
  test("should handle large number of pushes", async () => {
    let template = `@stack('items')`;
    
    // Gerar 100 pushes
    for (let i = 0; i < 100; i++) {
      template += `@push('items')<div>Item ${i}</div>@end`;
    }
    
    const result = await ejb.render(template);
    console.log(ejb.files)
    // Verificar se todos os items estão presentes
    for (let i = 0; i < 100; i++) {
      expect(result).toContain(`<div>Item ${i}</div>`);
    }
  });
});