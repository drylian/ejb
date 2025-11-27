import * as vscode from 'vscode';
import { initializeKireService } from './core/kire-service';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "vs-kire" is now active!');
    await initializeKireService(context);
}

export function deactivate() {}
