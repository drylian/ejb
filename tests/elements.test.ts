import { expect, test } from "bun:test";
import { Kire } from "../src/index";

test("Kire - Elements: Style Processing", async () => {
    const kire = new Kire();
    
    // Register an element handler for 'style'
    kire.element('style', (ctx) => {
        // Example: Remove all style tags and append a merged version to head?
        // For this test, we'll just replace the content of style tags
        // with a comment saying it was processed.
        
        // ctx.element.inner contains "body { color: red; }"
        // ctx.update modifies the GLOBAL result HTML.
        // We want to replace THIS element with a comment.
        
        const newContent = `<!-- Processed Style: ${ctx.element.inner.trim()} -->`;
        
        // We need to find where this element is in the current content and replace it.
        // Since `ctx.update` takes the FULL new HTML content, we have to do the replacement ourselves?
        // No, `ctx.element.outer` is the full tag string.
        
        // However, if multiple styles exist, simplistic replace might replace wrong one if duplicates exist.
        // But for the test, we assume unique content or we use the provided tools.
        
        // Let's modify the global content:
        const updatedHtml = ctx.content.replace(ctx.element.outer, newContent);
        ctx.update(updatedHtml);
    });

    const input = `
<html>
<head></head>
<body>
    <style> body { color: red; } </style>
    <h1>Hello</h1>
</body>
</html>`;

    const result = await kire.render(input);
    
    expect(result).toContain('<!-- Processed Style: body { color: red; } -->');
    expect(result).not.toContain('<style>');
});

test("Kire - Elements: Modifying Head", async () => {
    const kire = new Kire();
    
    kire.element('meta', (ctx) => {
        // Move meta tags to the start of head
        // This is tricky with regex replacement if we don't have robust parsing.
        // Let's just add an attribute to them.
        
        const newTag = ctx.element.outer.replace('<meta', '<meta data-processed="true"');
        ctx.update(ctx.content.replace(ctx.element.outer, newTag));
    });
    
    const input = `<head><meta name="test"></head>`;
    const result = await kire.render(input);
    
    expect(result).toContain('<meta data-processed="true" name="test">');
});
