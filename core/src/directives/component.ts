import type { Kire } from '../kire';

export default (kire: Kire) => {
    // @component('path', {vars}) ... @end
    // Uses slots.
    
    kire.directive({
        name: 'component',
        params: ['path:string', 'variables:object'],
        children: true,
        type: 'html',
        description: 'Loads a template as a reusable component, allowing content to be passed into named slots.',
        example: `@component('card', { title: 'My Card' })\n  @slot('header')\n    <h1>Card Header</h1>\n  @end\n  <p>Default content.</p>\n@end`,
        parents: [
            {
                name: 'slot',
                params: ['name:string'],
                children: true,
                type: 'html',
                description: 'Defines a named content slot within a component.',
                example: `@slot('header')\n  <h1>This is the header</h1>\n@end`,
                onCall(c) {
                    const name = c.param('name');
                    c.res(`$slots[${name}] = await (async ($parentCtx) => {`);
                    c.res(`  const $ctx = $parentCtx.clone();`);
                    if (c.children) c.set(c.children);
                    c.res(`  return $ctx[Symbol.for('~response')];`);
                    c.res(`})($ctx);`);
                }
            }
        ],
        onCall(ctx) {
            const pathExpr = ctx.param('path');
            const varsExpr = ctx.param('variables') || '{}';
            
            ctx.res(`await (async () => {`);
            ctx.res(`  const $slots = {};`);
            
            // Process children (which may contain @slot directives or default content)
            // Default content goes to $slot or 'default'?
            // In old component: 
            // "if (compiledChildren.trim()) { ejb.builder.add('$slots.$slot = ...') }"
            // And slots are in `parents`? Wait.
            // In old logic: `parents` were used for `@slot`.
            // But `@slot` is usually nested INSIDE component block.
            // `@component(...) @slot(...) ... @end @end`?
            // Or `@component(...) <p>Default</p> @slot('x')...@end @end`.
            
            // If `@slot` is a child directive, we need to capture it.
            // But normal content should be captured as default slot.
            
            // We need to separate @slot children from other children?
            // Or just execute children. Normal content appends to `$ctx.res` of this IIFE?
            // No, we want to capture slots into `$slots` object.
            
            // Strategy:
            // 1. Create a context for the component body (the block where slots are defined).
            // 2. In this context, text output goes to default slot?
            // 3. `@slot` directives write to `$slots`.
            
            ctx.res(`  const $bodyCtx = $ctx.clone();`);
            ctx.res(`  $bodyCtx.slots = $slots;`); // Expose slots map to body context so @slot can write to it?
            // Actually, @slot needs to write to the LOCAL `$slots` variable we defined above.
            // Directives run in the scope of `onCall`'s generated code.
            // So `@slot` generated code will run inside this IIFE.
            // So `$slots` is available!
            
            // But what about default content?
            // We can capture `$bodyCtx` response as default slot.
            
            // We need to render children using `$bodyCtx`.
            // But `ctx.set(children)` compiles children using the CURRENT compilation context.
            // It emits code into the current stream.
            // Code emitted: `$ctx[~response] += ...`.
            // We want it to be `$bodyCtx[~response] += ...`.
            
            // Compiler doesn't support changing the context variable name easily (it uses `$ctx` hardcoded in `with($ctx)`).
            // But we can shadow `$ctx`!
            
            ctx.res(`  await (async ($parentCtx) => {`);
            ctx.res(`    const $ctx = $bodyCtx;`); // Shadow $ctx
            ctx.res(`    with($ctx) {`);
            
            if (ctx.children) ctx.set(ctx.children);
            // Note: `ctx.set` will emit code using `$ctx`. Since we shadowed it, it uses `$bodyCtx`.
            
            ctx.res(`    }`);
            ctx.res(`  })($ctx);`);
            
            ctx.res(`  $slots.default = $bodyCtx[Symbol.for('~response')];`);
            
            // Now load the component template
            ctx.res(`  const path = $ctx.resolve(${JSON.stringify(pathExpr)});`);
            ctx.res(`  const templateFn = await $ctx.load(path);`);
            ctx.res(`  if (templateFn) {`);
            ctx.res(`    const locals = ${varsExpr};`);
            ctx.res(`    const componentCtx = $ctx.clone(locals);`);
            ctx.res(`    componentCtx.slots = $slots;`); // Pass slots to component
            ctx.res(`    await templateFn(componentCtx);`);
            ctx.res(`    $ctx.res(componentCtx[Symbol.for('~response')]);`);
            ctx.res(`  }`);
            
            ctx.res(`})();`);
        }
    });
};
