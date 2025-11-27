import type { Kire } from '../kire';

export default (kire: Kire) => {
    kire.directive({
        name: 'if',
        params: ['cond:string'],
        children: true,
        parents: [
            { 
                name: 'elseif',
                params: ['cond:string'],
                children: true, 
                onCall(c) { 
                    c.res(`} else if (${c.param('cond')}) {`); 
                    if(c.children) c.set(c.children); 
                } 
            },
            { 
                name: 'elif', // alias for elseif
                params: ['cond:string'],
                children: true, 
                onCall(c) { 
                    c.res(`} else if (${c.param('cond')}) {`); 
                    if(c.children) c.set(c.children); 
                } 
            },
            { 
                name: 'else', 
                children: true, 
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
        onCall(ctx) {
             ctx.res(`const ${ctx.param('expr')};`);
        }
    });

    kire.directive({
        name: 'let',
        params: ['expr:string'],
        onCall(ctx) {
             ctx.res(`let ${ctx.param('expr')};`);
        }
    });
    
    kire.directive({
        name: 'code',
        children: true,
        onCall(ctx) {
            if (ctx.children) ctx.set(ctx.children);
        }
    });

    kire.directive({
        name: 'switch',
        params: ['expr:string'],
        children: true,
        parents: [
             {
                 name: 'case',
                 params: ['val:string'],
                 children: true,
                 onCall(c) {
                     c.res(`case ${c.param('val')}: {`);
                     if(c.children) c.set(c.children);
                     c.res(`break; }`);
                 }
             },
             {
                 name: 'default',
                 children: true,
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
