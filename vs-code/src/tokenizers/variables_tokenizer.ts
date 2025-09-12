import * as vscode from 'vscode';

function apply_regex(content: string, offset: number, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, regex: RegExp, token_type: string) {
    for (const match of content.matchAll(regex)) {
        if (match.index === undefined) continue;
        const match_offset = offset + match.index;
        const match_length = match[0].length;
        const start_pos = document.positionAt(match_offset);
        const end_pos = document.positionAt(match_offset + match_length);
        builder.push(new vscode.Range(start_pos, end_pos), token_type, []);
    }
}

export function tokenize_variables(content: string, offset: number, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
    // Tokenizar variáveis do tipo {{ variavel }} - mais específico
    const variable_regex = /\{\{[\s\S]*?\}\}/g;
    
    for (const match of content.matchAll(variable_regex)) {
        if (match.index === undefined) continue;
        
        const match_offset = offset + match.index;
        const match_length = match[0].length;
        
        // Tokenizar as chaves
        builder.push(
            new vscode.Range(
                document.positionAt(match_offset),
                document.positionAt(match_offset + 2) // {{
            ),
            'keyword',
            []
        );
        
        builder.push(
            new vscode.Range(
                document.positionAt(match_offset + match_length - 2),
                document.positionAt(match_offset + match_length) // }}
            ),
            'keyword',
            []
        );
        
        // Tokenizar o conteúdo interno como variável
        if (match_length > 4) {
            builder.push(
                new vscode.Range(
                    document.positionAt(match_offset + 2),
                    document.positionAt(match_offset + match_length - 2)
                ),
                'variable',
                []
            );
        }
    }
}