import * as vscode from 'vscode';
import { EJBConfig, EnrichedDirective } from './types';

export class ConfigManager {
    private directives: EnrichedDirective[] = [];
    private directiveNames = new Set<string>();
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;

    private readonly _onDidFinishLoading = new vscode.EventEmitter<void>();
    public readonly onDidFinishLoading: vscode.Event<void> = this._onDidFinishLoading.event;

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.setupWatcher();
        this.loadConfiguration(); // Inicia o carregamento em segundo plano
    }

    private async loadConfiguration(): Promise<void> {
        this.outputChannel.appendLine('EJB: Iniciando o carregamento da configuração...');
        
        this.directives = [];
        this.directiveNames.clear();

        await this.loadRootConfig();
        await this.loadSecondaryConfigs();
        
        this.outputChannel.appendLine(`EJB: Configuração carregada. ${this.directives.length} diretivas disponíveis.`);
        this._onDidFinishLoading.fire();
    }

    private async loadRootConfig(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.outputChannel.appendLine('EJB: Nenhum workspace aberto, pulando o carregamento da configuração raiz.');
            return;
        }
        const rootConfigUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'ejbconfig.json');

        try {
            const fileContent = await vscode.workspace.fs.readFile(rootConfigUri);
            this.outputChannel.appendLine(`EJB: Encontrado ejbconfig.json raiz em ${rootConfigUri.fsPath}`);
            const config = JSON.parse(fileContent.toString()) as EJBConfig;
            this.addConfig(config);
        } catch (error) {
            this.outputChannel.appendLine('EJB: Nenhum ejbconfig.json raiz encontrado no workspace.');
        }
    }

    private async loadSecondaryConfigs(): Promise<void> {
        let globs: string[] = ['node_modules/**/ejbconfig.json']; // Padrão para buscar em node_modules
        const rootConfig = this.directives.length > 0 ? this.directives[0] : null;

        // Se um config raiz foi carregado e define `includes`, use-o
        if (rootConfig && rootConfig.sourcePackage === 'ejb-core' && Array.isArray((rootConfig as any).includes)) {
            globs = (rootConfig as any).includes;
        }

        this.outputChannel.appendLine(`EJB: Procurando configurações com os padrões: ${globs.join(', ')}`);
        for (const glob of globs) {
            try {
                const uris = await vscode.workspace.findFiles(glob, '**/node_modules/node_modules/**');
                for (const uri of uris) {
                    try {
                        const fileContent = await vscode.workspace.fs.readFile(uri);
                        const config = JSON.parse(fileContent.toString()) as EJBConfig;
                        this.addConfig(config);
                    } catch (error: any) {
                        this.outputChannel.appendLine(`EJB: Erro ao carregar o arquivo de configuração secundário: ${uri.fsPath}: ${error.message}`);
                    }
                }
            } catch (error: any) {
                this.outputChannel.appendLine(`EJB: Erro ao procurar arquivos com o padrão '${glob}': ${error.message}`);
            }
        }
    }

    private addConfig(config: EJBConfig) {
        if (!config.directives || !config.package) return;
        this.outputChannel.appendLine(`EJB: Carregando diretivas do pacote: ${config.package}`);
        for (const directive of config.directives) {
            if (!this.directiveNames.has(directive.name)) {
                this.directives.push({ ...directive, sourcePackage: config.package, sourceUrl: config.url });
                this.directiveNames.add(directive.name);
            }
        }
    }

    public getDirectives(): EnrichedDirective[] {
        return this.directives;
    }

    private setupWatcher() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/ejbconfig.json');
        this.context.subscriptions.push(watcher);

        const reload = (uri: vscode.Uri) => {
            this.outputChannel.appendLine(`EJB: Arquivo de configuração alterado: ${uri.fsPath}. Recarregando.`);
            this.loadConfiguration();
        };

        watcher.onDidChange(reload);
        watcher.onDidCreate(reload);
        watcher.onDidDelete(reload);
    }

    dispose() {
        this._onDidFinishLoading.dispose();
    }
}