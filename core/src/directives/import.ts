import type { Kire } from '../kire';

export default (kire: Kire) => {
    kire.directive({
        name: 'include',
        params: ['path:string', 'locals:object'],
        children: true,
        type: 'html',
        description: 'Includes and renders a template from a given path, optionally passing local variables. Can also wrap content passed as "content" variable.',
        example: `@include('partials/card')\n  <p>Card content</p>\n@end`,
        onCall(ctx) {
            const pathExpr = ctx.param('path');
            const localsExpr = ctx.param('locals') || '{}';
            
            ctx.res(`await (async () => {
    const path = $ctx.resolve(${JSON.stringify(pathExpr)});
    const templateFn = await $ctx.load(path);
    
    if (templateFn) {
        let content = '';`);
            
            if (ctx.children && ctx.children.length > 0) {
                ctx.res(`const $bodyCtx = $ctx.clone();
        await (async ($parentCtx) => {
            const $ctx = $bodyCtx;
            with($ctx) {`);
                ctx.set(ctx.children);
                ctx.res(`}
        })($ctx);
        content = $bodyCtx[Symbol.for('~response')];`);
            }

            ctx.res(`const locals = Object.assign({ content }, ${localsExpr});
        const childCtx = $ctx.clone(locals);
        await templateFn(childCtx);
        $ctx.res(childCtx[Symbol.for('~response')]);
    }
})();`);
        }
    });
};