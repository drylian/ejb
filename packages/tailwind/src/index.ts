// src/index.ts
import type { KirePlugin } from 'kire';
import { compile } from 'tailwindcss';
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { createRequire } from 'module';

export type TailwindCompileOptions = Parameters<typeof compile>[1];
const require = createRequire(import.meta.url);

async function loadStylesheet(id: string, base: string) {
  if (id === 'tailwindcss') {
    try {
      const path = require.resolve('tailwindcss/index.css');
      const content = await readFile(path, 'utf-8');
      return { base: dirname(path), content, path  };
    } catch (e) {
      console.error('Failed to resolve tailwindcss/index.css', e);
    }
  }
  
  try {
    // Tenta resolver outros imports relativos ou do node_modules
    const path = require.resolve(id, { paths: [base] });
    const content = await readFile(path, 'utf-8');
    return { base: dirname(path), content, path };
  } catch (e) {
    // Ignora erros de resolução para outros arquivos por enquanto
    return { base, content: '', path:'' };
  }
}

export const KireTailwind: KirePlugin = {
  name: "@kirejs/tailwind",
  options: {
    config: {},
    optimize: { minify: false }
  },
  async load(kire, opts) {
    const tailwindOptions: TailwindCompileOptions = {
      ...opts,
      loadStylesheet,
      from: undefined
    };

    /**
     * Diretiva @tailwind para processar CSS com Tailwind
     */
    kire.directive({
      name: 'tailwind',
      params: ['code:string'],
      children: true,
      childrenRaw: true,
      async onCall(ctx) {
        try {
          let code = ctx.param('code');
          
          // Se não houver código via param, tentar pegar do corpo (children)
          if (!code && ctx.children && ctx.children.length > 0) {
              code = ctx.children.map(c => c.content || '').join('');
          }

          // Se ainda não houver código, usar o padrão do Tailwind
          if (!code || !code.trim()) {
             code = '@import "tailwindcss";';
          }
          
          // Em vez de compilar agora, geramos um elemento <tailwind>
          // que será processado após a renderização do HTML completo
          ctx.res('$ctx.res("<tailwind>");');
          ctx.res(`$ctx.res(${JSON.stringify(code)});`);
          ctx.res('$ctx.res("</tailwind>");');
        } catch (error) {
          console.warn('Tailwind directive error:', error);
          // Fallback
          let code = ctx.param('code') || '';
          ctx.res('$ctx.res("<tailwind>");');
          ctx.res(`$ctx.res(${JSON.stringify(code)});`);
          ctx.res('$ctx.res("</tailwind>");');
        }
      }
    });

    // Elemento <tailwind> para conteúdo CSS
    kire.element('tailwind', async (ctx) => {
      try {
        let content = ctx.element.inner || '';
        if (!content.trim()) {
             content = '@import "tailwindcss";';
        }

        // Scan candidates from the full content
        const candidates = new Set<string>();
        const classRegex = /\bclass(?:Name)?\s*=\s*(["'])(.*?)\1/g;
        let match;
        // We scan ctx.content which is the full HTML
        while ((match = classRegex.exec(ctx.content)) !== null) {
            const cls = match[2]!.split(/\s+/);
            cls.forEach(c => { if(c) candidates.add(c); });
        }

        const processedCSS = await compileCSSWithTailwind(content, tailwindOptions, Array.from(candidates));
        const newHtml = ctx.content.replace(ctx.element.outer, `<style>${processedCSS}</style>`);
        ctx.update(newHtml);
      } catch (error) {
        console.warn('Tailwind compilation error:', error);
        const newHtml = ctx.content.replace(ctx.element.outer, `<style>${ctx.element.inner || ''}</style>`);
        ctx.update(newHtml);
      }
    });
    
  },
}

// Função para processar CSS com a API real do Tailwind
async function compileCSSWithTailwind(css: string, options: TailwindCompileOptions, candidates: string[] = []): Promise<string> {
  try {
    // Se o CSS estiver vazio, retornar vazio
    if (!css || !css.trim()) return '';

    // Usar a API de compilação do Tailwind
    const result = await compile(css, options);
    
    // Construir o CSS com as classes encontradas
    const processedCSS = result.build(candidates);
    
    return processedCSS;
  } catch (error) {
    console.error('Error in Tailwind compilation:', error);
    throw error;
  }
}

export default KireTailwind;