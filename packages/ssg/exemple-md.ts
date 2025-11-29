import KireSsg from './src/index';
import KireAssets from '../assets/src/index';
import KireIconify from '../iconify/src/index';
import KireTailwind from '../tailwind/src/index';
import KireMarkdown from '../markdown/src/index';
import { Kire } from '../../core/src/index';
import { readFile } from 'fs/promises';

console.log("Running Kire SSG Markdown Example...");

// Setup environment
const rootDir = './examples-md';
const fs = await import('fs/promises');
await fs.mkdir(rootDir, { recursive: true });
await fs.mkdir(`${rootDir}/docs`, { recursive: true });

// Create layout
await fs.writeFile(`${rootDir}/docs.kire`, `
<html>
<head>
    <title>Docs</title>
    @assets()
    @tailwind
    @end
</head>
<body class="bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto bg-white p-6 rounded shadow prose">
        @markdown('docs/*.md')
    </div>
</body>
</html>
`);

// Create markdown content
await fs.writeFile(`${rootDir}/docs/intro.md`, `
# Introduction

Welcome to **Kire SSG**. This page was generated from Markdown.

## Features
- Static Site Generation
- Markdown Support
- Tailwind CSS
`);

const kire = new Kire({
    root: rootDir,
    plugins: [
        [KireSsg, { assetsPrefix: '_assets' }],
        KireTailwind,
        KireIconify,
        KireMarkdown,
        [KireAssets, { prefix: '_assets' }]
    ],
    // We need a resolver that can read files from disk for this example to work end-to-end
    resolver: async (path) => {
        try {
            return await readFile(path, 'utf-8');
        } catch (e) {
            throw new Error(`Template not found: ${path}`);
        }
    }
});

// Build
console.log("Building...");
await KireSsg.build({ out: 'dist-md' });
console.log("Done. Check dist-md/docs/intro.html");
