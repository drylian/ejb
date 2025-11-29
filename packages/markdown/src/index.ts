import type { KirePlugin, Kire } from 'kire';
import { marked } from 'marked';

declare module 'kire' {
    interface Kire {
        parseMarkdown(content: string): Promise<string>;
    }
}

export interface MarkdownOptions {
    // marked options if needed
}

export const KireMarkdown: KirePlugin<MarkdownOptions> = {
    name: '@kirejs/markdown',
    options: {},
    load(kire: Kire, opts) {
        // Expose parser for other plugins (like SSG)
        kire.parseMarkdown = async (content: string) => {
            return marked.parse(content) as Promise<string> | string as Promise<string>;
        };

        kire.directive({
            name: 'markdown',
            params: ['source:string'],
            async onCall(ctx) {
                const source = ctx.param('source');
                
                // 1. Check if it is a glob pattern (SSG layout mode)
                // Simple heuristic: contains *
                if (source.includes('*')) {
                    // This directive call registers the current template as a generator for this glob
                    // We can't easily know "current template file path" inside a directive unless passed in context.
                    // core/src/compiler/index.ts doesn't pass file path yet to context.
                    // But for SSG, we can handle this differently.
                    
                    // When rendering a single page, this directive might be called.
                    // If we are in "SSG Build Mode", we want to capture this intent.
                    // But usually, SSG scans files.
                    
                    // If this is a runtime render of a layout that has @markdown('glob'),
                    // it implies this layout shouldn't really be rendered "as is" for a single output, 
                    // OR it renders a list of links?
                    
                    // The request implies: "SSG plugin will treat this docs.kire as a layout generator."
                    // So we need to signal SSG.
                    
                    // We'll output a marker comment that SSG can parse from the compiled/rendered output?
                    // OR we store it in the context.
                    
                    // Let's assume when SSG renders `docs.kire`, it sees this directive.
                    // If we output a special marker, SSG can detect it.
                    ctx.res(`$ctx.res("<!-- KIRE_MARKDOWN_GEN:${source} -->");`);
                    return;
                }

                // 2. Normal Mode: Render markdown file or string
                ctx.res(`await (async () => {`);
                ctx.res(`  const src = ${JSON.stringify(source)};`);
                ctx.res(`  let content = '';`);
                
                // Check if it looks like a file path (ends with .md or .markdown)
                ctx.res(`  if (src.endsWith('.md') || src.endsWith('.markdown')) {`);
                ctx.res(`     try {`);
                ctx.res(`       // Resolve path relative to root or current? assuming root for now`);
                ctx.res(`       const path = $ctx.resolve(src);`);
                // We need fs access. Kire resolver might be needed.
                // But default resolver returns string content of .kire files.
                // We might need a raw file reader.
                // Assuming node environment for now as per KireSsg context.
                ctx.res(`       const fs = await import('fs/promises');`); 
                ctx.res(`       content = await fs.readFile(path, 'utf-8');`);
                ctx.res(`     } catch (e) { content = src; }`); // Fallback to treating as string if file fails?
                ctx.res(`  } else {`);
                ctx.res(`     content = src;`);
                ctx.res(`  }`);
                
                ctx.res(`  const { marked } = await import('marked');`);
                ctx.res(`  $ctx.res(marked.parse(content));`);
                ctx.res(`})();`);
            }
        });
    }
};

export default KireMarkdown;
