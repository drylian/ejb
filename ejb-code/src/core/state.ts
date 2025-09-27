import * as vscode from 'vscode';
import { createStore } from 'zustand/vanilla';
import type { EJBConfig, EnrichedDirective, ProcessedEJB } from '@/types/index';
import EjbCoreJson from '../../../ejbconfig.json' with { type: "json" };

interface EJBState {
    directives: EnrichedDirective[];
    loading: boolean;
    embeddedLanguagesCache: Map<string, ProcessedEJB>;
    deputation: boolean;
}

interface EJBStore extends EJBState {
    init: (context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) => void;
    loadConfiguration: (outputChannel: vscode.OutputChannel) => Promise<void>;
    hasEmbeddedLanguage(key: string): boolean;
    getEmbeddedLanguage(key: string): ProcessedEJB | undefined;
    setEmbeddedLanguage(key: string, value: ProcessedEJB): void;
    deleteEmbeddedLanguage(key: string): void;
}

export const ejbStore = createStore<EJBStore>((set, get) => ({
    directives: [],
    loading: true,
    embeddedLanguagesCache: new Map(),
    deputation: false,

    hasEmbeddedLanguage: (key: string) => {
        return get().embeddedLanguagesCache.has(key);
    },
    getEmbeddedLanguage: (key: string) => {
        return get().embeddedLanguagesCache.get(key); 
    },
    setEmbeddedLanguage: (key: string, value: ProcessedEJB) => {
        const cache = new Map(get().embeddedLanguagesCache);
        cache.set(key, value);
        set({ embeddedLanguagesCache: cache });
    },
    deleteEmbeddedLanguage: (key: string) => {
        const cache = new Map(get().embeddedLanguagesCache);
        cache.delete(key);
        set({ embeddedLanguagesCache: cache });
    },
    init: (context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) => {
        const load = () => get().loadConfiguration(outputChannel);
        
        load(); // Initial load

        const watcher = vscode.workspace.createFileSystemWatcher('**/ejbconfig.json');
        context.subscriptions.push(watcher);

        const reload = (uri: vscode.Uri) => {
            outputChannel.appendLine(`EJB: Configuration file changed: ${uri.fsPath}. Reloading.`);
            load();
        };

        watcher.onDidChange(reload);
        watcher.onDidCreate(reload);
        watcher.onDidDelete(reload);
    },
    loadConfiguration: async (outputChannel: vscode.OutputChannel) => {
        set({ loading: true });
        outputChannel.appendLine('EJB: Loading configuration...');

        const newDirectives: EnrichedDirective[] = [];
        const directiveNames = new Set<string>();
        const allConfigs: EJBConfig[] = [EjbCoreJson as EJBConfig];

        const addConfig = (config: EJBConfig) => {
            if (!config.directives || !config.package) return;
            allConfigs.push(config);
            outputChannel.appendLine(`EJB: Loading directives from package: ${config.package}`);
            for (const directive of config.directives) {
                if (!directiveNames.has(directive.name.toString())) {
                    newDirectives.push({ 
                        ...directive, 
                        sourcePackage: config.package, 
                        sourceUrl: config.url 
                    });
                    directiveNames.add(directive.name.toString());
                }
            }
        };

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const rootConfigUri = vscode.Uri.joinPath((workspaceFolders[0] as vscode.WorkspaceFolder).uri, 'ejbconfig.json');
            try {
                const fileContent = await vscode.workspace.fs.readFile(rootConfigUri);
                outputChannel.appendLine(`EJB: Found root ejbconfig.json at ${rootConfigUri.fsPath}`);
                const config = JSON.parse(fileContent.toString()) as EJBConfig;
                addConfig(config);
            } catch {
                outputChannel.appendLine('EJB: No root ejbconfig.json found in workspace.');
            }
        } else {
            outputChannel.appendLine('EJB: No workspace open, skipping root configuration load.');
        }

        let globs: string[] = ['node_modules/**/ejbconfig.json'];
        const coreConfig = allConfigs.find(c => c.package === '@caeljs/ejb');

        if (coreConfig && Array.isArray(coreConfig.includes)) {
            globs = coreConfig.includes;
        }

        if (coreConfig && (coreConfig as any).deputation) {
            set({ deputation: true });
        }

        outputChannel.appendLine(`EJB: Searching for configurations with patterns: ${globs.join(', ')}`);
        for (const glob of globs) {
            try {
                const uris = await vscode.workspace.findFiles(glob, '**/node_modules/node_modules/**');
                for (const uri of uris) {
                    try {
                        const fileContent = await vscode.workspace.fs.readFile(uri);
                        const config = JSON.parse(fileContent.toString()) as EJBConfig;
                        addConfig(config);
                    } catch (error: any) {
                        outputChannel.appendLine(`EJB: Error loading secondary config file: ${uri.fsPath}: ${error.message}`);
                    }
                }
            } catch (error: any) {
                outputChannel.appendLine(`EJB: Error searching for files with pattern '${glob}': ${error.message}`);
            }
        }

        set({ directives: newDirectives, loading: false });
        outputChannel.appendLine(`EJB: Configuration loaded. ${newDirectives.length} directives available.`);
    }
}));
