import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";

const pwd = process.cwd();

// Shared configuration for component testing
const createEjbInstance = () =>
	new Ejb({
		async: false,
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

test("should handle component with default slot", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
            <p>Default slot content</p>
        @end
    `;

	const result = ejb.render(template);

	// Check if the default slot content has been rendered inside the div.box
	expect(result.replace(/\s+/g, " ").trim()).toContain(
		"<p>Default slot content</p>",
	);
});

test("should handle component with named slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
                <p>Default slot content</p>    
            @slot('header')
                <h1>Only Header</h1>
            @slot('content')
                <p>Custom Content</p>
        @end
    `;

	const result = ejb.render(template);

	// Check the complete structure with named slots and default.
	const normalizedResult = result.replace(/\s+/g, " ").trim();

	expect(normalizedResult).toContain('<div class="box">');
	expect(normalizedResult).toContain("<h1>Only Header</h1>");
	expect(normalizedResult).toContain("<p>Custom Content</p>");
	expect(normalizedResult).toContain("<p>Default slot content</p>");
});

test("should handle component with partial slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
                <p>Default slot only</p>
            @slot('header')
                <h1>Only Header</h1>
        @end
    `;

	const result = ejb.render(template);
	const normalizedResult = result.replace(/\s+/g, " ").trim();

	expect(normalizedResult).toContain("<h1>Only Header</h1>");
	expect(normalizedResult).toContain("<p>Default slot only</p>");
	expect(normalizedResult).not.toContain("$header");
	expect(normalizedResult).not.toContain("$content");
});

test("should handle empty slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
            <!-- No slots provided -->
        @end
    `;

	const result = ejb.render(template);

	// It should render only the basic structure without content.
	expect(result.replace(/\s+/g, " ").trim()).toBe(
		'<div class="box"> <!-- No slots provided --> </div>',
	);
});

test("should handle 'if' directive", () => {
	const ejb = createEjbInstance();
	const template = `@if(true)Hello@end`;
	const result = ejb.render(template);
	expect(result).toBe("Hello");
});

test("should handle 'for' directive", () => {
	const ejb = createEjbInstance();
	const template = `@for(let i = 0; i < 3; i++){{i}}@end`;
	const result = ejb.render(template);
	expect(result).toBe("012");
});

test("should handle 'import' directive", () => {
	const ejb = createEjbInstance();
	const template = `@import('@/imported')`;
	const result = ejb.render(template);
	expect(result).toContain("This is imported content.");
});

test("should handle 'isset' directive", () => {
	const ejb = createEjbInstance();
	const template = `@isset(it.name)`;
	const result = ejb.render(template, { name: "John" });
	expect(result).toBe("John");
});

describe("Push and Stack Directives", () => {
  let ejb: any;

  beforeEach(() => {
    ejb = createEjbInstance();
  });

  // Teste básico
  test("should handle basic push and stack", () => {
    const template = `@stack('test') @push('test')<div>Only Test</div>@end`;
    const result = ejb.compileNode(ejb.parserAst(template));
    expect(result).toContain("<div>Only Test</div>");
  });

  // Teste com múltiplos push para a mesma stack
  test("should handle multiple pushes to same stack", () => {
    const template = `
      @stack('scripts')
      @push('scripts')<script src="jquery.js"></script>@end
      @push('scripts')<script src="app.js"></script>@end
    `;
    
    const result = ejb.compileNode(ejb.parserAst(template));
    expect(result).toContain('<script src="jquery.js"></script>');
    expect(result).toContain('<script src="app.js"></script>');
    expect(result.indexOf('jquery.js')).toBeLessThan(result.indexOf('app.js'));
  });

  // Teste com stacks diferentes
  test("should handle multiple different stacks", () => {
    const template = `
      @stack('styles')
      @stack('scripts')
      @push('styles')<style>.test { color: red; }</style>@end
      @push('scripts')<script>console.log('test');</script>@end
    `;
    
    const result = ejb.compileNode(ejb.parserAst(template));
    expect(result).toContain('<style>.test { color: red; }</style>');
    expect(result).toContain('<script>console.log(\'test\');</script>');
  });

  // Teste com stack vazio
  test("should handle empty stack", () => {
    const template = `@stack('empty')`;
    const result = ejb.render(template);
    expect(result).toBe("");
  });

  // Teste com conteúdo complexo
  test("should handle complex content with variables", () => {
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
    
    const result = ejb.render(template, context);
    expect(result).toContain("<h1>My Page</h1>");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
    expect(result).toContain("<li>Item 3</li>");
  });

  // Teste com push aninhado em condicionais
  test("should handle push inside conditionals", () => {
    const context = { showExtra: true };
    const template = `
      @stack('content')
      @if(it.showExtra)
        @push('content')<div class="extra">Extra Content</div>@end
      @end
      @push('content')<div class="main">Main Content</div>@end
    `;
    
    const result = ejb.render(template, context);
    expect(result).toContain('<div class="extra">Extra Content</div>');
    expect(result).toContain('<div class="main">Main Content</div>');
  });

  // Teste com push em loops
  test("should handle push inside loops", () => {
    const context = { items: ['a', 'b', 'c'] };
    const template = `
      @stack('list')
      @for(const $item of it.items)
        @push('list')<li>{{ $item }}</li>@end
      @end
    `;
    
    const result = ejb.render(template, context);
    expect(result).toContain('<li>a</li>');
    expect(result).toContain('<li>b</li>');
    expect(result).toContain('<li>c</li>');
  });

  // Teste de ordem de renderização
  test("should maintain push order", () => {
    const template = `
      @stack('items')
      @push('items')<div>First</div>@end
      @push('items')<div>Second</div>@end
      @push('items')<div>Third</div>@end
    `;
    
    const result = ejb.compileNode(ejb.parserAst(template));
    const firstIndex = result.indexOf('First');
    const secondIndex = result.indexOf('Second');
    const thirdIndex = result.indexOf('Third');
    
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });

  // Teste com stack em múltiplos lugares
  test("should handle same stack in multiple places", () => {
    const template = `
      @stack('partial')
      @push('partial')<div>Part 1</div>@end
      @stack('partial')
      @push('partial')<div>Part 2</div>@end
    `;
    
    const result = ejb.render(template);

    expect(result).toContain('<div>Part 1</div>');
    expect(result).toContain('<div>Part 2</div>');
    expect((result.match(/Part 1/g) || []).length).toBe(2);
    expect((result.match(/Part 2/g) || []).length).toBe(2);
  });

  // Teste com conteúdo HTML complexo
  test("should handle complex HTML content", () => {
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
    
    const result = ejb.compileNode(ejb.parserAst(template));
    expect(result).toContain('class="modal"');
    expect(result).toContain('data-id="test-modal"');
    expect(result).toContain('onclick="console.log(\'clicked\')"');
  });

  // Teste de performance com muitos pushes
  test("should handle large number of pushes", () => {
    let template = `@stack('items')`;
    
    // Gerar 100 pushes
    for (let i = 0; i < 100; i++) {
      template += `@push('items')<div>Item ${i}</div>@end`;
    }
    
    const result = ejb.compileNode(ejb.parserAst(template));
    
    // Verificar se todos os items estão presentes
    for (let i = 0; i < 100; i++) {
      expect(result).toContain(`<div>Item ${i}</div>`);
    }
  });
});