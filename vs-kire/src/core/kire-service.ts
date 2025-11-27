import * as vscode from 'vscode';
import { Kire, KireSchematic, DirectiveDefinition } from 'kire';
import { AnalyticalParser } from '@kirejs/analytical';
import { useKireStore } from './state';

export async function initializeKireService(context: vscode.ExtensionContext) {
    const kireStore = useKireStore.getState();

    // 1. Find kire-schema.json files
    const schemaUris = await findKireSchemas();

    // 2. Load and merge schemas
    const mergedSchema = await loadAndMergeSchemas(schemaUris);

    // 3. Create Analytical Kire instance
    const analyticalKire = createAnalyticalKire(mergedSchema);

    // 4. Store the instance
    kireStore.setKireInstance(analyticalKire);

    console.log('Kire Service initialized with:', analyticalKire.pkgSchema('vs-kire-internal'));
}

async function findKireSchemas(): Promise<vscode.Uri[]> {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }

    // Find schemas in the root of all workspace folders and in all node_modules folders
    const rootSchemaPattern = 'kire-schema.json';
    const nodeModulesSchemaPattern = '**/node_modules/*/kire-schema.json';

    // It's more efficient to run one findFiles call with multiple patterns
    const combinedPattern = `{${rootSchemaPattern},${nodeModulesSchemaPattern}}`;
    
    // Exclude nested node_modules to avoid deep, slow searches
    const excludePattern = '**/node_modules/**/node_modules/**';

    const schemaUris = await vscode.workspace.findFiles(combinedPattern, excludePattern);
    
    return schemaUris;
}

interface MergedSchema {
    directives: DirectiveDefinition[];
    // Add other schematic properties if needed
}

async function loadAndMergeSchemas(uris: vscode.Uri[]): Promise<MergedSchema> {
    const allDirectives: DirectiveDefinition[] = [];
    const decoder = new TextDecoder('utf-8');

    for (const uri of uris) {
        try {
            const contentUint8 = await vscode.workspace.fs.readFile(uri);
            const content = decoder.decode(contentUint8);
            const schema: KireSchematic = JSON.parse(content);
            if (schema.directives) {
                allDirectives.push(...schema.directives);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to load or parse schema from ${uri.fsPath}: ${e}`);
        }
    }
    return { directives: allDirectives };
}

function createAnalyticalKire(mergedSchema: MergedSchema): Kire {
    // Create Kire instance without default directives, using AnalyticalParser
    const kire = new Kire({
        directives: false, // Do not load default directives
        engine: {
            parser: AnalyticalParser,
        }
    });

    // Register directives from the merged schema
    for (const def of mergedSchema.directives) {
        const analyticalDef: DirectiveDefinition = {
            ...def,
            onCall: async (ctx) => {
                // This is a mock/analytical onCall.
                // In a real language server, this would trigger validation,
                // generate semantic tokens, or prepare data for other language features.
                // For now, it's empty, serving only to register the metadata.
            },
            parents: def.parents?.map(p => ({
                ...p,
                onCall: async (c) => {} // No-op for analytical parent directives
            }))
        };
        kire.directive(analyticalDef);
    }

    return kire;
}