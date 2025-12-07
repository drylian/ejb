// src/index.ts (plugin)
import clientFn from './client';
import type { KirePlugin, Node } from 'kire';

const plugin: KirePlugin = {
  name: 'client',
  options: {},
  load(kire) {
    // Injeta o runtime no client
    kire.directive({
      name: 'kireclient',
      type: 'html',
      description: 'Injects the client-side runtime necessary for Kire interactivity.',
      example: "@kireclient",
      onCall(ctx) {
        const code = clientFn.toString();
        ctx.res(`<script>(${code})();</script>`);
      }
    });

    // Região interativa no client
    kire.directive({
      name: 'client',
      params: ['ref:string', 'state:object'],
      children: true,
      type: 'html',
      description: 'Mounts a client-side interactive region associated with a specific reference and initial state. This directive compiles its children into a render function executed on the client.',
      example: "@client('counter-app', { count: 0 })\n  <h2>Counter: {{ it.count }}</h2>\n  <button onclick=\"it.increment()\">Increment</button>\n@end",
      async onCall(ctx) {
        const ref = ctx.param('ref');

        // state vem como código (ex: "{ count: 0 }")
        let state = ctx.param('state') as string | undefined;
        if (state == null || state === '') {
          state = '{}';
        }

        // Compila os filhos para gerar o JS que monta HTML no client
        const compiler = new kire.compilerConstructor(kire);
        const children = ctx.children || [];
        const code = await compiler.compile(children);

        // Placeholder pro mount encontrar no client
        ctx.res(`<!-- $${ref} -->`);

        // Script que registra o mount
        ctx.res(`<script>`);
        ctx.res(`$kire.mount(${JSON.stringify(ref)}, async ($ctx, $scope) => {`);
        ctx.res(`  const it = $scope || ${state};`); // 'it' inicial, se você quiser usar no lado client
        ctx.res(code);
        ctx.res(`});`);
        ctx.res(`</script>`);
      }
    });

    // Setup reativo
    kire.directive({
      name: 'reactive',
      params: ['ref:string'],
      children: true,
      type: 'html',
      description: 'Defines the reactive logic (state, computed values, functions) for a specific reference. This code is executed on the client to setup the store.',
      example: "@reactive('counter-app')\n  let count = $state(0);\n  const increment = () => count(prev => prev + 1);\n  return { count, increment };\n@end",
      onCall(ctx) {
        const ref = ctx.param('ref');

        // Monta o corpo da função de setup a partir dos filhos
        let body = '';
        if (ctx.children) {
          for (const child of ctx.children as Node[]) {
            if (child.type === 'text') {
              body += child.content;
            } else if (child.type === 'variable') {
              // Reconstroi {{ ... }} caso o parser tenha quebrado
              body += `{{ ${child.content} }}`;
            }
          }
        }

        ctx.res(`<script>`);
        ctx.res(`$kire.reactive(${JSON.stringify(ref)}, () => {`);
        ctx.res(body);
        ctx.res(`});`);
        ctx.res(`</script>`);
      }
    });

    // @ref('nome') -> kire:ref="nome"
    kire.directive({
      name: 'ref',
      params: ['name:string'],
      type: 'html',
      description: 'Marks an element with a kire:ref attribute, creating a mount point or a referenceable DOM element for client-side logic.',
      example: "<div @ref('counter-app')>...</div>",
      onCall(ctx) {
        const name = ctx.param('name');
        // Contexto HTML, então não usamos JSON.stringify aqui
        ctx.res(`kire:ref="${name}"`);
      }
    });
  }
};

export default plugin;
