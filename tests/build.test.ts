import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import path from "path";

test("should build template with client and css artifacts", async () => {
    const writtenFiles: Record<string, string> = {};
    const mockWriter = async (filepath: string, content: string) => {
        writtenFiles[path.basename(filepath)] = content;
    };

    const templateContent = `
        @css
            body { color: red; }
        @end

        @css('global')
            .global { font-size: 16px; }
        @end

        @client
            const search = @element('search');
            @effect([search], 500)
                console.log(search.value);
            @end
        @end

        @clientTemplate('MyTemplate', { items: [] })
            <ul>
                @for(const item of items)
                    <li @ref(item.id)>{{ item.name }}</li>
                @end
            </ul>
        @end

        <h1>Server Content</h1>
    `;

    const ejb = new Ejb({
        writer: mockWriter,
        root: path.resolve('.'),
        resolver: async (p) => {
            if (p.endsWith('views/build-test.ejb')) {
                return templateContent;
            }
            return '';
        }
    });

    await ejb.build('views/build-test.ejb', 'dist');

    const writtenFilenames = Object.keys(writtenFiles);
    
    // 1. Check for server, client, css, and global css files
    const serverFile = writtenFilenames.find(f => f.startsWith('se-build-test'));
    const clientFile = writtenFilenames.find(f => f.startsWith('cl-build-test'));
    const localCssFile = writtenFilenames.find(f => f.startsWith('build-test') && f.endsWith('.css'));
    const globalCssFile = writtenFilenames.find(f => f.startsWith('_EJB_GLOBAL_') && f.endsWith('.css'));
    const manifestFile = 'ejb.json';

    expect(serverFile).toBeDefined();
    expect(clientFile).toBeDefined();
    expect(localCssFile).toBeDefined();
    expect(globalCssFile).toBeDefined();
    expect(writtenFiles[manifestFile]).toBeDefined();

    // 2. Check content of CSS files
    expect(writtenFiles[localCssFile!]).toContain('body { color: red; }');
    expect(writtenFiles[globalCssFile!]).toContain('.global { font-size: 16px; }');
    
    // 3. Check content of client file
    const clientContent = writtenFiles[clientFile!];
    expect(clientContent).toContain('$ejb.js(async ($ejb) =>');
    expect(clientContent).toContain(`const search = $ejb.element('search');`);
    expect(clientContent).toContain(`$ejb.effect(async () =>`);
    expect(clientContent).toContain(`console.log(search.value);`);

    expect(clientContent).toContain(`$ejb.load('MyTemplate', async ($ejb, { items: [] }) =>`);
    expect(clientContent).toContain('<ul>');
    expect(clientContent).toContain('for (const item of items) {');
    expect(clientContent).toContain(`ejb:ref="item.id"`);
    expect(clientContent).toContain('$ejb.res += $ejb.escapeHtml(item.name)');

    // 4. Check content of manifest
    const manifest = JSON.parse(writtenFiles[manifestFile]);
    const manifestEntry = manifest['@/views/build-test.ejb'];
    expect(manifestEntry).toBeDefined();
    expect(manifestEntry.entry).toBe(serverFile);
    expect(manifestEntry.assets).toContain(clientFile);
    expect(manifestEntry.assets).toContain(localCssFile);
});
