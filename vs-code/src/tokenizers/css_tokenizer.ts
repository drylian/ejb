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

export function tokenize_css(content: string, offset: number, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
    const selector_regex = /([a-zA-Z0-9#.,\s>+~:-]+)(?=\s*\{)/g;
    const property_regex = /([a-zA-Z-]+)\s*:/g;
    const comment_regex = /\/\*[\s\S]*?\*\//g;
    const value_regex = /:\s*([^;{}]+)(?=;|\})/g;
    const color_regex = /(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:\d*\.)?\d+\s*\)|\b(?:red|green|blue|black|white|yellow|purple|orange|gray|cyan|magenta)\b)/gi;
    const important_regex = /!important\b/g;
    const string_regex = /(["'])(?:(?=(\\?))\2.)*?\1/g;
    const function_regex = /([a-zA-Z-]+)\(/g;

    apply_regex(content, offset, builder, document, comment_regex, 'comment');
    apply_regex(content, offset, builder, document, string_regex, 'string');
    apply_regex(content, offset, builder, document, selector_regex, 'class');
    apply_regex(content, offset, builder, document, property_regex, 'property');
    apply_regex(content, offset, builder, document, value_regex, 'value');
    apply_regex(content, offset, builder, document, color_regex, 'color');
    apply_regex(content, offset, builder, document, important_regex, 'keyword');
    apply_regex(content, offset, builder, document, function_regex, 'function');
}