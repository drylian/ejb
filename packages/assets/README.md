### 4. Using Markdown with SSG

To use markdown, you can use the `@kirejs/markdown` plugin (install it separately).

```typescript
import KireMarkdown from '@kirejs/markdown';
kire.plugin(KireMarkdown);
```

In your template:

```html
<!-- docs.kire -->
@layout('layouts/docs')
    @markdown('docs/*.md')
@end
```

If you use `@markdown('glob/*.md')`, the SSG plugin will treat this `docs.kire` as a **layout generator**.
It will find all markdown files matching the glob, and for each one:
1. Render the markdown content.
2. Inject it into the `docs.kire` template (where `@markdown` is called).
3. Generate an HTML file for each markdown file (e.g., `docs/intro.md` -> `dist/docs/intro.html`).

This allows you to have a single layout file drive the generation of your entire documentation site.