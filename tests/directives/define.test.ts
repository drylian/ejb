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

describe("Define and Defined Directives", () => {
  let ejb: Ejb;

  beforeEach(() => {
    ejb = createEjbInstance();
  });

  test("should handle basic define and defined", async () => {
    const template = `@defined('test') @define('test')<div>Only Test</div>@end`;
    const result = await ejb.render(template);
    expect(result).toContain("<div>Only Test</div>");
  });

  test("should handle multiple defines to same key", async () => {
    const template = `
      @defined('scripts')
      @define('scripts')<script src="jquery.js"></script>@end
      @define('scripts')<script src="app.js"></script>@end
    `;
    
    const result = await ejb.render(template);
    expect(result).not.toContain('<script src="jquery.js"></script>');
    expect(result).toContain('<script src="app.js"></script>');
  });

  test("should handle multiple different defines", async () => {
    const template = `
      @defined('styles')
      @defined('scripts')
      @define('styles')<style>.test { color: red; }</style>@end
      @define('scripts')<script>console.log('test');</script>@end
    `;
    
    const result = await ejb.render(template);
    expect(result).toContain('<style>.test { color: red; }</style>');
    expect(result).toContain("<script>console.log('test');</script>");
  });

  test("should handle empty defined", async () => {
    const template = `@defined('empty')`;
    const result = await ejb.render(template);
    expect(result.trim()).toBe("");
  });

  test("should handle complex content with variables", async () => {
    const context = { title: "My Page", items: [1, 2, 3] };
    const template = `
      @defined('content')
      @define('content')
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

  test("should handle define inside conditionals", async () => {
    const context = { showExtra: true };
    const template = `
      @defined('content')
      @if(it.showExtra)        @define('content')<div class="extra">Extra Content</div>@end      @end
    `;
    
    const result = await ejb.render(template, context);
    expect(result).toContain('<div class="extra">Extra Content</div>');
  });

  test("should handle define inside loops", async () => {
    const context = { items: ['a', 'b', 'c'] };
    const template = `
      @defined('list')
      @for(const $item of it.items)
        @define('list')<li>{{ $item }}</li>@end
      @end
    `;
    
    const result = await ejb.render(template, context);
    expect(result).toContain('<li>c</li>');
    // Note: The original test expected these not to be contained.
    // However, the behavior of @define for loops might change the output.
    // If the @define is inside a loop, it defines the content for each iteration.
    // The last define will overwrite previous ones if the same key is used.
    // I'll keep the original assertions for now and see if they pass.
    expect(result).not.toContain('<li>a</li>');
    expect(result).not.toContain('<li>b</li>');
  });

  test("should handle same defined in multiple places", async () => {
    const template = `
      @defined('partial')
      @define('partial')<div>Part 1</div>@end
      @defined('partial')
    `;
    
    const result = await ejb.render(template);
    expect(result.match(/Part 1/g)?.length).toBe(2);
  });

  test("should handle complex HTML content", async () => {
    const template = `
      @defined('modal')
      @define('modal')
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

  test("should handle large number of defines", async () => {
    let template = `@defined('items')`;
    
    for (let i = 0; i < 100; i++) {
      template += `@define('items')<div>Item ${i}</div>@end`;
    }
    
    const result = await ejb.render(template);
    
    for (let i = 0; i < 99; i++) {
      expect(result).not.toContain(`<div>Item ${i}</div>`);
    }
    expect(result).toContain(`<div>Item 99</div>`);
  });
});