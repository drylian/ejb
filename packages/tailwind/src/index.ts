import type { KirePlugin } from 'kire';
import { compile } from 'tailwindcss';
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { createRequire } from 'module';
import { createHash } from 'crypto';

export type TailwindCompileOptions = Parameters<typeof compile>[1];

const require = createRequire(import.meta.url);
const CachedCss = new Map<string, string>();

/**
 * Loads CSS stylesheets for Tailwind processing
 */
async function loadStylesheet(id: string, base: string) {
  // Handle tailwindcss core stylesheet
  if (id === 'tailwindcss') {
    try {
      const path = require.resolve('tailwindcss/index.css');
      const content = await readFile(path, 'utf-8');
      return { base: dirname(path), content, path };
    } catch (e) {
      console.error('Failed to resolve tailwindcss/index.css', e);
    }
  }
  
  // Resolve other imports (relative paths or node_modules)
  try {
    const path = require.resolve(id, { paths: [base] });
    const content = await readFile(path, 'utf-8');
    return { base: dirname(path), content, path };
  } catch (e) {
    // Silently ignore resolution errors for other files
    return { base, content: '', path: '' };
  }
}

/**
 * Loads JavaScript modules for Tailwind configuration
 */
async function loadModule(id: string, base: string) {
  try {
    const resolvedPath = require.resolve(id, { paths: [base] });
    const module = await import(resolvedPath);
    return {
      path: resolvedPath,
      base: dirname(resolvedPath),
      module: module.default || module, // Handle both ES and CJS modules
    };
  } catch (e) {
    console.error(`Failed to load module "${id}" from "${base}"`, e);
    throw e;
  }
}

export const KireTailwind: KirePlugin<TailwindCompileOptions> = {
  name: "@kirejs/tailwind",
  options: {},
  async load(kire, opts) {
    const tailwindOptions: TailwindCompileOptions = {
      ...opts,
      loadStylesheet,
      loadModule,
      from: undefined
    };

    /**
     * @tailwind directive for processing CSS with Tailwind
     */
    kire.directive({
      name: 'tailwind',
      params: ['code:string'],
      children: true,
      childrenRaw: true,
      async onCall(ctx) {
        try {
          let code = ctx.param('code');
          
          // Fallback to children content if no parameter provided
          if (!code && ctx.children && ctx.children.length > 0) {
            code = ctx.children.map(c => c.content || '').join('');
          }
          
          // Use default Tailwind import if no code provided
          if (!code || !code.trim()) {
            code = '@import "tailwindcss";';
          }
          
          // Generate cache ID if caching is enabled
          if (kire.cache) {
            const hash = createHash('sha256').update(code).digest('hex');
            ctx.res(`$ctx.res('<tailwind id="${hash}">');`);
          } else {
            ctx.res('$ctx.res("<tailwind>");');
          }

          ctx.res(`$ctx.res(${JSON.stringify(code)});`);
          ctx.res('$ctx.res("</tailwind>");');
        } catch (error) {
          console.warn('Tailwind directive error:', error);
          // Fallback behavior
          let code = ctx.param('code') || '';
          ctx.res('$ctx.res("<tailwind>");');
          ctx.res(`$ctx.res(${JSON.stringify(code)});`);
          ctx.res('$ctx.res("</tailwind>");');
        }
      }
    });

    /**
     * <tailwind> element for CSS content processing
     */
    kire.element('tailwind', async (ctx) => {
      try {
        const id = ctx.element.attributes.id;

        // Use cached CSS if available and caching is enabled
        if (kire.cache && id && CachedCss.has(id)) {
          const cachedCss = CachedCss.get(id) ?? '';
          const newHtml = ctx.content.replace(ctx.element.outer, `<style>${cachedCss}</style>`);
          ctx.update(newHtml);
          return;
        }

        // Compilation logic (cache miss or caching disabled)
        let content = ctx.element.inner || '';
        
        // Ensure Tailwind CSS is imported if not present
        if (!content.includes('@import "tailwindcss"')) {
          content = `@import "tailwindcss";\n${content}`;
        }

        // Extract CSS classes from the entire HTML content
        const candidates = new Set<string>();
        const classRegex = /\bclass(?:Name)?\s*=\s*(["'])(.*?)\1/g;
        let match;
        
        while ((match = classRegex.exec(ctx.content)) !== null) {
          const cls = match[2]!.split(/\s+/);
          cls.forEach(c => { if (c) candidates.add(c); });
        }

        const processedCSS = await compileCSSWithTailwind(
          content, 
          tailwindOptions, 
          Array.from(candidates)
        );

        // Cache the result if caching is enabled
        if (kire.cache && id) {
          CachedCss.set(id, processedCSS);
        }

        const newHtml = ctx.content.replace(ctx.element.outer, `<style>${processedCSS}</style>`);
        ctx.update(newHtml);

      } catch (error) {
        console.warn('Tailwind compilation error:', error);
        // Fallback: use original content without processing
        const newHtml = ctx.content.replace(ctx.element.outer, `<style>${ctx.element.inner || ''}</style>`);
        ctx.update(newHtml);
      }
    });
  },
}

/**
 * Processes CSS using Tailwind's compilation API
 */
async function compileCSSWithTailwind(
  css: string, 
  options: TailwindCompileOptions, 
  candidates: string[] = []
): Promise<string> {
  try {
    if (!css || !css.trim()) return '';
    
    const result = await compile(css, options);
    const processedCSS = result.build(candidates);
    
    return processedCSS;
  } catch (error) {
    console.error('Error in Tailwind compilation:', error);
    throw error;
  }
}

export default KireTailwind;