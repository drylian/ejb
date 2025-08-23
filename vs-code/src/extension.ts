import * as vscode from 'vscode';
import { EJBConfigManager } from './EJBConfigManager';
import { EJBCompletionProvider } from './EJBCompletionProvider';
import { EJBHoverProvider } from './EJBHoverProvider';

// Variáveis globais para gerenciar o estado
let configManager: EJBConfigManager;
let completionProvider: EJBCompletionProvider;
let hoverProvider: EJBHoverProvider;
let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
    console.log('[EJB] Extension activating...');

    try {
        configManager = EJBConfigManager.getInstance();
        
        // Inicializar antes de registrar os providers
        await configManager.initialize();
        
        completionProvider = new EJBCompletionProvider(configManager);
        hoverProvider = new EJBHoverProvider(configManager);

        // Registrar providers para a linguagem EJB
        const completionDisposable = vscode.languages.registerCompletionItemProvider(
            { language: 'ejb', scheme: 'file' },
            completionProvider,
            '@'
        );

        const hoverDisposable = vscode.languages.registerHoverProvider(
            { language: 'ejb', scheme: 'file' },
            hoverProvider
        );

        // Configurar watchers para mudanças de workspace
        const workspaceChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
            console.log('[EJB] Workspace folders changed, reloading configs...');
            try {
                await configManager.initialize();
            } catch (error) {
                console.warn('[EJB] Error reloading configs after workspace change:', error);
            }
        });

        // Configurar watchers para mudanças de configuração
        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('ejb')) {
                console.log('[EJB] Configuration changed, reloading...');
                configManager.initialize().catch(console.error);
            }
        });

        // Adicionar todos os disposables ao contexto
        disposables = [
            completionDisposable,
            hoverDisposable,
            workspaceChangeDisposable,
            configChangeDisposable
        ];

        disposables.forEach(disposable => context.subscriptions.push(disposable));

        console.log('[EJB] Extension activated successfully');

    } catch (error) {
        console.error('[EJB] Failed to activate extension:', error);
        vscode.window.showErrorMessage('EJB Extension failed to activate. See console for details.');
    }
}

export function deactivate() {
    console.log('[EJB] Extension deactivating...');
    
    // Limpar todos os recursos
    disposables.forEach(disposable => disposable.dispose());
    disposables = [];
    
    if (configManager) {
        configManager.dispose();
    }
    
    console.log('[EJB] Extension deactivated');
}