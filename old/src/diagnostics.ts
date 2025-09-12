import * as vscode from 'vscode';
import { ejbParser, Ejb,  AstNode, DirectiveNode, EjbAst, SubDirectiveNode } from '../../src';

function getDirectiveNodes(node: AstNode): (DirectiveNode | SubDirectiveNode)[] {
    const directives: (DirectiveNode | SubDirectiveNode)[] = [];
    if (node.type === EjbAst.Directive || node.type === EjbAst.SubDirective) {
        directives.push(node as DirectiveNode | SubDirectiveNode);
    }

    if ('children' in node && node.children) {
        for (const child of node.children) {
            directives.push(...getDirectiveNodes(child));
        }
    }
    return directives;
}

export function updateDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
    ejb_instance: Ejb<boolean> // Changed from configManager
): void {
    if (document.languageId !== 'ejb') {
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    
    const loadedDirectives = Object.values(ejb_instance.directives); // Get directives from ejb_instance
    
    if (loadedDirectives.length === 0) {
        // Não execute diagnósticos de diretivas se nenhuma configuração foi carregada ainda.
        // Isso evita falsos positivos durante a inicialização.
        collection.clear();
        return;
    }

    const knownDirectives = new Set<string>();
    loadedDirectives.forEach(d => {
        if (typeof d.name === 'string') { // Ensure name is a string
            knownDirectives.add(d.name);
        }
        if (d.parents) {
            d.parents.forEach(p => knownDirectives.add(p.name));
        }
    });
    knownDirectives.add('end');

    try {
        const ast = ejbParser(ejb_instance, text); // Use ejb_instance for parsing
        const usedDirectives = getDirectiveNodes(ast);

        for (const directiveNode of usedDirectives) {
            if (!knownDirectives.has(directiveNode.name)) {
                const regex = new RegExp(`@${directiveNode.name}`, 'g');
                let match;
                while((match = regex.exec(text)) != null) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(match.index + match[0].length);
                    const range = new vscode.Range(startPos, endPos);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Diretiva desconhecida: @${directiveNode.name}`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostics.push(diagnostic);
                    break; 
                }
            }
        }

    } catch (error: any) {
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        const diagnostic = new vscode.Diagnostic(
            range,
            `Erro de parsing do EJB: ${error.message}`,
            vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
    }

    collection.set(document.uri, diagnostics);
}