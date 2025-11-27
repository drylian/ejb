import type { Kire } from '../kire';

export default (kire: Kire) => {
    kire.directive({
        name: 'if',
        params: ['cond:string'],
        children: true,
        type: 'js',
        description: 'Conditionally renders a block of content if the expression is true.',
        example: `@if(user.isLoggedIn)\n  Welcome, {{ user.name }}!\n@end`,
        parents: [
            { 
                name: 'elseif',
                params: ['cond:string'],
                children: true,
                type: 'js',
                description: 'Renders a block of content if the preceding @if/@elseif is false and the current expression is true.',
                example: `@elseif(user.isAdmin)\n  Admin access granted.\n@end`,
                onCall(c) { 
                    c.res(`} else if (${c.param('cond')}) {`); 
                    if(c.children) c.set(c.children); 
                } 
            },
            { 
                name: 'elif', // alias for elseif
                params: ['cond:string'],
                children: true, 
                type: 'js',
                description: 'Alias for @elseif.',
                example: `@elif(user.isAdmin)\n  Admin access granted.\n@end`,
                onCall(c) { 
                    c.res(`} else if (${c.param('cond')}) {`); 
                    if(c.children) c.set(c.children); 
                } 
            },
            { 
                name: 'else', 
                children: true, 
                type: 'js',
                description: 'Renders a block of content if the preceding @if/@elseif expressions are all false.',
                example: `@else\n  Please log in.\n@end`,
                onCall(c) { 
                    c.res(`} else {`); 
                    if(c.children) c.set(c.children); 
                } 
            }
        ],
        onCall(ctx) {
            ctx.res(`if (${ctx.param('cond')}) {`);
            if (ctx.children) ctx.set(ctx.children);
            if (ctx.parents) ctx.set(ctx.parents);
            ctx.res('}');
        }
    });

    kire.directive({
        name: 'for',
        params: ['expr:string'],
        children: true,
        type: 'js',
        description: 'Iterates over an array or object, similar to a JavaScript for...of loop.',
        example: `@for(user of users)\n  <p>{{ user.name }}</p>\n@end`,
        onCall(ctx) {
            const expr = ctx.param('expr'); 
            if (expr.includes(' in ')) {
                const [lhs, rhs] = expr.split(' in ');
                ctx.res(`for (const ${lhs} of ${rhs}) {`);
            } else if (expr.includes(' of ')) {
                const [lhs, rhs] = expr.split(' of ');
                 ctx.res(`for (const ${lhs} of ${rhs}) {`);
            } else {
                ctx.res(`for (${expr}) {`);
            }
            
            if (ctx.children) ctx.set(ctx.children);
            ctx.res(`}`);
        }
    });
    
    kire.directive({
        name: 'const',
        params: ['expr:string'],
        type: 'js',
        description: 'Declares a block-scoped constant, similar to JavaScript `const`.',
        example: `@const(myVar = 'hello world')`,
        onCall(ctx) {
             ctx.res(`const ${ctx.param('expr')};`);
        }
    });

    kire.directive({
        name: 'let',
        params: ['expr:string'],
        type: 'js',
        description: 'Declares a block-scoped local variable, similar to JavaScript `let`.',
        example: `@let(counter = 0)`,
        onCall(ctx) {
             ctx.res(`let ${ctx.param('expr')};`);
        }
    });
    
    kire.directive({
        name: 'code',
        children: true,
        type: 'js',
        description: 'Executes a block of raw JavaScript code on the server.',
        example: `@code\n  console.log('This runs during template compilation.');\n@end`,
        onCall(ctx) {
            if (ctx.children) ctx.set(ctx.children);
        }
    });

    kire.directive({
        name: 'switch',
        params: ['expr:string'],
        children: true,
        type: 'js',
        description: 'Provides a control flow statement similar to a JavaScript switch block.',
        example: `@switch(value)\n  @case(1) ... @end\n  @default ... @end\n@end`,
        parents: [
             {
                 name: 'case',
                 params: ['val:string'],
                 children: true,
                 type: 'js',
                 description: 'A case clause for a @switch statement.',
                 example: `@case('A')\n  <p>Value is A</p>\n@end`,
                 onCall(c) {
                     c.res(`case ${c.param('val')}: {`);
                     if(c.children) c.set(c.children);
                     c.res(`break; }`);
                 }
             },
             {
                 name: 'default',
                 children: true,
                 type: 'js',
                 description: 'The default clause for a @switch statement.',
                 example: `@default\n  <p>Value is something else</p>\n@end`,
                 onCall(c) {
                     c.res(`default: {`);
                     if(c.children) c.set(c.children);
                     c.res(`}`);
                 }
             }
        ],
        onCall(ctx) {
             ctx.res(`switch (${ctx.param('expr')}) {`);
             // Switch structure typically has case/default as parents (related nodes)
             // Wait, in `parents` array we define SUB-directives.
             // `case` and `default` ARE nested inside `switch`.
             // But typically they are direct children in AST? 
             // OR they are siblings in the chain?
             // Switch syntax: @switch(x) @case(1)...@end @default...@end @end
             // No, usually: @switch(x) @case(1)... @break @default ... @end
             
             // If we use the `parents` logic (sub-directives), then:
             // @switch(x) 
             //   @case(1) ... @end
             // @end
             
             // If `case` is defined as a sub-directive in `parents` of `switch`, 
             // the parser will treat it as a related node IF it is at the same level?
             // No, `parents` in parser logic handles "chaining" (if...elseif...else).
             // Switch cases are CHILDREN of the switch block.
             // So they should be normal directives or handled via children traversal?
             
             // If `case` is a normal directive, it needs to be registered globally?
             // Or registered only inside `switch`.
             // But our `kire.directive` recurses `parents`.
             
             // If `case` is in `parents` of `switch`, it is registered.
             // But parser only links it to `related` if it follows the pattern `@switch ... @case`.
             // Chained style: `@switch(...) ... @end`.
             // Inside `...`, we have `@case`.
             // That is NOT a chain. That is nesting.
             
             // So `case` should just be processed as a child node.
             // But `case` needs to be a valid directive.
             // If we define it in `parents`, it gets registered.
             
             if (ctx.children) ctx.set(ctx.children);
             ctx.res(`}`);
        }
    });
};
