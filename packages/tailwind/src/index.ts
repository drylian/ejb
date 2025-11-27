// src/index.ts
import type { KirePlugin } from 'kire';
import { compile, type CompileOptions } from 'tailwindcss';

export const KireTailwind: KirePlugin = {
  name: "@kirejs/tailwind",
  options: {
    config: {},
    optimize: { minify: false }
  },
  async load(kire, opts) {
    const tailwindOptions: CompileOptions = {
      ...opts,
      from: undefined
    };

    /**
     * Diretiva @tailwind para processar CSS com Tailwind
     */
    kire.directive({
      name: 'tailwind',
      params: ['code:string'],
      children: true,
      async onCall(ctx) {
        try {
          let code = ctx.param('code');
          // Garantir que o código não seja undefined
          if (!code) code = '';
          
          // Processar o CSS com a API real do Tailwind
          const processed = await compileCSSWithTailwind(code, tailwindOptions);
          
          ctx.res('$ctx.res("<style>");');
          ctx.res(`$ctx.res(\`${processed}\`);`);
          ctx.res('$ctx.res("</style>");');
        } catch (error) {
          // Fallback para o CSS original em caso de erro
          console.warn('Tailwind compilation error:', error);
          let code = ctx.param('code') || '';
          ctx.res('$ctx.res("<style>");');
          ctx.res(`$ctx.res(\`${code}\`);`);
          ctx.res('$ctx.res("</style>");');
        }
      }
    });

    // Elemento <tailwind> para conteúdo CSS
    kire.element('tailwind', async (ctx) => {
      try {
        const content = ctx.content || '';
        const processedCSS = await compileCSSWithTailwind(content, tailwindOptions);
        ctx.update(`<style>${processedCSS}</style>`);
      } catch (error) {
        console.warn('Tailwind compilation error:', error);
        ctx.update(`<style>${ctx.content || ''}</style>`);
      }
    });
    
    // Elemento para aplicar classes Tailwind
    kire.element('apply', (ctx) => {
      const classes = (ctx.content || '').trim();
      // IMPORTANTE: ctx.children contém o conteúdo interno do elemento
      const childrenContent = ctx.children || '';
      ctx.update(`<div class="${classes}">${childrenContent}</div>`);
    });
  },
}

// Função para processar CSS com a API real do Tailwind
async function compileCSSWithTailwind(css: string, options: CompileOptions): Promise<string> {
  try {
    // Se o CSS estiver vazio, retornar vazio
    if (!css || !css.trim()) return '';

    // Usar a API de compilação do Tailwind
    const result = await compile(css, options);
    
    // Construir o CSS com as classes necessárias
    const processedCSS = result.build([]);
    
    return processedCSS;
  } catch (error) {
    console.error('Error in Tailwind compilation:', error);
    throw error;
  }
}

export default KireTailwind;