import * as vscode from 'vscode';
import { createStore } from 'zustand/vanilla';
import type { EJBConfig, EnrichedDirective } from './types';

interface EJBState {
    directives: EnrichedDirective[];
    loading: boolean;
}

interface EJBStore extends EJBState {
    init: (context: vscode.ExtensionContext, output_channel: vscode.OutputChannel) => void;
    load_configuration: (output_channel: vscode.OutputChannel) => Promise<void>;
}

export const ejb_store = createStore<EJBStore>((set, get) => ({
    directives: [],
    loading: true,
    init: (context: vscode.ExtensionContext, output_channel: vscode.OutputChannel) => {
        const load = () => get().load_configuration(output_channel);
        
        load(); // Initial load

        const watcher = vscode.workspace.createFileSystemWatcher('**/ejbconfig.json');
        context.subscriptions.push(watcher);

        const reload = (uri: vscode.Uri) => {
            output_channel.appendLine(`EJB: Configuration file changed: ${uri.fsPath}. Reloading.`);
            load();
        };

        watcher.onDidChange(reload);
        watcher.onDidCreate(reload);
        watcher.onDidDelete(reload);
    },
    load_configuration: async (output_channel: vscode.OutputChannel) => {
        set({ loading: true });
        output_channel.appendLine('EJB: Loading configuration...');

        const new_directives: EnrichedDirective[] = [];
        const directive_names = new Set<string>();

        const add_config = (config: EJBConfig) => {
            if (!config.directives || !config.package) return;
            output_channel.appendLine(`EJB: Loading directives from package: ${config.package}`);
            for (const directive of config.directives) {
                if (!directive_names.has(directive.name)) {
                    new_directives.push({ 
                        ...directive, 
                        sourcePackage: config.package, 
                        sourceUrl: config.url 
                    });
                    directive_names.add(directive.name);
                }
            }
        };

        const workspace_folders = vscode.workspace.workspaceFolders;
        if (workspace_folders && workspace_folders.length > 0) {
            const root_config_uri = vscode.Uri.joinPath((workspace_folders[0] as vscode.WorkspaceFolder).uri, 'ejbconfig.json');
            try {
                const file_content = await vscode.workspace.fs.readFile(root_config_uri);
                output_channel.appendLine(`EJB: Found root ejbconfig.json at ${root_config_uri.fsPath}`);
                const config = JSON.parse(file_content.toString()) as EJBConfig;
                add_config(config);
            } catch {
                output_channel.appendLine('EJB: No root ejbconfig.json found in workspace.');
            }
        } else {
            output_channel.appendLine('EJB: No workspace open, skipping root configuration load.');
        }

        let globs: string[] = ['node_modules/**/ejbconfig.json'];
        const root_config = new_directives.length > 0 ? new_directives[0] : null;

        if (root_config && root_config.sourcePackage === 'ejb-core' && Array.isArray((root_config as any).includes)) {
            globs = (root_config as any).includes;
        }

        output_channel.appendLine(`EJB: Searching for configurations with patterns: ${globs.join(', ')}`);
        for (const glob of globs) {
            try {
                const uris = await vscode.workspace.findFiles(glob, '**/node_modules/node_modules/**');
                for (const uri of uris) {
                    try {
                        const file_content = await vscode.workspace.fs.readFile(uri);
                        const config = JSON.parse(file_content.toString()) as EJBConfig;
                        add_config(config);
                    } catch (error: any) {
                        output_channel.appendLine(`EJB: Error loading secondary config file: ${uri.fsPath}: ${error.message}`);
                    }
                }
            } catch (error: any) {
                output_channel.appendLine(`EJB: Error searching for files with pattern '${glob}': ${error.message}`);
            }
        }

        set({ directives: new_directives, loading: false });
        output_channel.appendLine(`EJB: Configuration loaded. ${new_directives.length} directives available.`);
    }
}));