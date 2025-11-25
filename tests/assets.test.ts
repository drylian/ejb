import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";

test("should render assets in production mode from manifest", async () => {

    const ejb = new Ejb({

        manifest: {

            '@/views/main.ejb': {

                entry: 'se-main.123.js',

                assets: ['cl-main.456.js', 'main.789.css']

            },

            '@/views/global.ejb': {

                entry: '',

                assets: ['global.abc.css']

            }

        }

    });



    const template = `@assets()`;

    const result = await ejb.render(template);



    const expectedFullString = `<script src="/cl-main.456.js" defer></script>

<link rel="stylesheet" href="/main.789.css">

<link rel="stylesheet" href="/global.abc.css">

`;

    expect(String(result)).toBe(expectedFullString);

});

test("should render assets in development mode from in-memory files", async () => {
    const templateContent = `
        @css
            .local { color: blue; }
        @end
        @client
            console.log('client script');
        @end
        @assets()
    `;

    const ejb = new Ejb({
        depuration: true,
        resolver: async (p) => {
            // This resolver is now just a fallback, the content is passed directly
            return `<!-- Fallback content for ${p} -->`;
        }
    });

    const result = await ejb.render(templateContent);
    
    // Check for inlined CSS
    expect(String(result)).toContain('<style efl="__EJB_DEBBUG__">'); // Use __EJB_DEBBUG__ as the default virtual path
    expect(String(result)).toContain('.local { color: blue; }');
    expect(String(result)).toContain('</style>');

    // Check for inlined JS
    expect(String(result)).toContain('<script efl="__EJB_DEBBUG__">'); // Use __EJB_DEBBUG__ as the default virtual path
    expect(String(result)).toContain(`$ejb.js(async ($ejb) => {
console.log('client script');
});`);
    expect(String(result)).toContain('</script>');
});

test("should produce correct asset tags based on file extension", async () => {
    const ejb = new Ejb({
        manifest: {
            'entry1': { assets: ['my-script.js', 'my-style.css', 'another-script.js'] }
        }
    });
    const result = await ejb.render(`@assets()`); // Pass directive content directly
    const expected = `
<link rel="stylesheet" href="/my-style.css">
<script src="/my-script.js" defer></script>
<script src="/another-script.js" defer></script>
`.trim().split('\n').sort().join('\n');
    
    const actual = String(result).trim().split('\n').sort().join('\n');

    expect(actual).toBe(expected);
});

test("should not render anything if manifest is empty", async () => {
    const ejb = new Ejb({ manifest: {} });
    const result = await ejb.render('@assets()'); // Pass directive content directly
    expect(String(result)).toContain('<!-- [EJB] Manifest not loaded or empty -->');
});

test("should not render anything if depuration is on but no assets are generated", async () => {
    const ejb = new Ejb({
        depuration: true,
        resolver: async (p) => `Just text`
    });
    const result = await ejb.render(`@assets()`); // Test a template with @assets() but no actual assets
    expect(String(result)).not.toContain('<style');
    expect(String(result)).not.toContain('<script');
});
