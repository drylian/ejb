import * as vscode from 'vscode';
import { EJBConfig, EJBDirective } from './types';

export class EJBConfigManager {
    private static instance: EJBConfigManager;
    private directivesMap = new Map<string, EJBDirective>();
    private isLoading = false;
    private disposables: vscode.Disposable[] = [];
    private configLoadPromise: Promise<void> | null = null;

    static getInstance(): EJBConfigManager {
        if (!EJBConfigManager.instance) {
            EJBConfigManager.instance = new EJBConfigManager();
        }
        return EJBConfigManager.instance;
    }

    async initialize(): Promise<void> {
        if (this.isLoading) {
            return this.configLoadPromise!;
        }
        
        this.isLoading = true;
        
        // Reutilizar a mesma promise se já estiver carregando
        if (!this.configLoadPromise) {
            this.configLoadPromise = this.loadAllConfigs()
                .finally(() => {
                    this.isLoading = false;
                    this.configLoadPromise = null;
                });
        }
        
        return this.configLoadPromise;
    }

    private async loadAllConfigs(): Promise<void> {
        this.directivesMap.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const loadPromises: Promise<void>[] = [];

        for (const folder of workspaceFolders) {
            // Load from workspace root
            const rootConfigUri = vscode.Uri.joinPath(folder.uri, 'ejb-config.json');
            loadPromises.push(this.loadSingleConfig(rootConfigUri));

            // Load from node_modules (limit to avoid performance issues)
            const nodeModulesUri = vscode.Uri.joinPath(folder.uri, 'node_modules');
            loadPromises.push(this.loadFromNodeModules(nodeModulesUri));
        }

        await Promise.allSettled(loadPromises);
    }

    private async loadFromNodeModules(nodeModulesUri: vscode.Uri): Promise<void> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(nodeModulesUri);
            const configPromises: Promise<void>[] = [];
            
            // Limit to 50 packages to avoid performance issues
            const limitedEntries = entries.slice(0, 50);
            
            for (const [name, type] of limitedEntries) {
                if (type === vscode.FileType.Directory && !name.startsWith('.')) {
                    const configUri = vscode.Uri.joinPath(nodeModulesUri, name, 'ejb-config.json');
                    configPromises.push(this.loadSingleConfig(configUri));
                }
            }
            
            await Promise.allSettled(configPromises);
        } catch (error) {
            // node_modules doesn't exist or can't be read - that's fine
        }
    }

    private async loadSingleConfig(configUri: vscode.Uri): Promise<void> {
        try {
            const data = await vscode.workspace.fs.readFile(configUri);
            const content = new TextDecoder().decode(data);
            const config: EJBConfig = JSON.parse(content);
            
            if (config.directives && Array.isArray(config.directives)) {
                for (const directive of config.directives) {
                    if (directive.name && directive.description) {
                        this.directivesMap.set(directive.name, { ...directive });
                    }
                }
            }
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                // This is expected, ignore silently.
            } else {
                console.warn(`[EJB] Error loading config from ${configUri.fsPath}:`, error);
            }
        }
    }

    private setupWatchers(): void {
        // Clean up existing watchers
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Watch only ejb-config.json files, not all files
        const watcher = vscode.workspace.createFileSystemWatcher('**/ejb-config.json', false, false, false);
        
        const reloadConfigs = () => {
            if (!this.isLoading) {
                this.loadAllConfigs().catch(() => {
                    // Ignore errors during reload
                });
            }
        };

        this.disposables.push(
            watcher,
            watcher.onDidChange(reloadConfigs),
            watcher.onDidCreate(reloadConfigs),
            watcher.onDidDelete(reloadConfigs)
        );
    }

    getDirective(name: string): EJBDirective | undefined {
        return this.directivesMap.get(name);
    }

    getAllDirectives(): EJBDirective[] {
        return Array.from(this.directivesMap.values());
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.directivesMap.clear();
        this.configLoadPromise = null;
    }
}