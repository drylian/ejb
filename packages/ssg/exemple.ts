import KireSsg from './src/index';
import KireAssets from '../assets/src/index';
import KireIconify from '../iconify/src/index';
import KireTailwind from '../tailwind/src/index';
import { Kire } from '../../core/src/index';

// Mock resolver for example purposes since we don't have a full file structure here
// In a real app, you'd use @kirejs/resolver or the default file system resolver
const kire = new Kire({
    root: './examples', // Assumes an examples folder exists or will be created
    plugins: [
        [KireSsg, { assetsPrefix: '_assets' }],
        KireTailwind,
        KireIconify,
        [KireAssets, { prefix: '_assets' }]
    ]
});

// Mock some templates for the example if they don't exist
// Since we can't easily write files to 'examples' in this script without fs, 
// we'll rely on Kire's resolver. 
// Overriding resolver for this example to return string content directly.
kire.$resolver = async (path) => {
    if (path.includes('index')) return `
        <html>
            <head>
                <title>Kire SSG Example</title>
                @assets()
                @tailwind
                @end
            </head>
            <body>
                <h1 class="text-3xl font-bold underline text-blue-600">
                    Hello from Kire SSG!
                </h1>
                            <iconify i="mdi:home" class="w-8 h-8" />
                <p class="mt-4 text-gray-600">This is a static page.</p>
                <script>console.log('Client side script');</script>
            </body>
        </html>
    `;
    throw new Error(`Template not found: ${path}`);
};

// Mock crawling for build (since we override resolver, we must override how SSG finds files)
// In a real scenario, KireSsg scans the file system.
// For this example to work without files, we might need to mock fs.readdir or just rely on the user creating files.
// However, let's assume the user will run this in a context where they might want to test it with real files.
// But to make it runnable immediately as requested:

console.log("Running Kire SSG Example...");

const args = process.argv.slice(2);
const command = args[0];

if (command === 'build' || args.includes('--build')) {
    console.log("Building...");
    // We need to trick SSG into finding our 'index' file if we are using the mocked resolver.
    // But SSG uses `readdir`. 
    // So this example file assumes you actually have files in `./examples`.
    // I will create a dummy file for it to find.
    
    const fs = await import('fs/promises');
    await fs.mkdir('./examples', { recursive: true });
    await fs.writeFile('./examples/index.kire', `
        <html>
        <head>
            <title>Kire SSG</title>
            @assets()
        </head>
        <body>
            <h1 class="text-2xl font-bold text-red-500">Static Site Generation</h1>
            <iconify i="mdi:home" class="w-8 h-8" />
            <style>body { background: #eee; }</style>
        </body>
        </html>
    `);

    await KireSsg.build({ out: 'dist' });
} else {
    console.log("Starting Dev Server...");
    // Dev server
    KireSsg.dev({ port: 3000 });
}
