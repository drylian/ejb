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

export function tokenize_js(content: string, offset: number, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, params_only = false) {
    const string_regex = /(['"`])(?:\\.|[^\\])*?\1/g;
    apply_regex(content, offset, builder, document, string_regex, 'string');

    if (params_only) return;

    const keyword_regex = /\b(const|let|var|function|if|else|for|while|return|import|export|from|async|await|class|extends|super|new|this|true|false|null|undefined|debugger|do|in|instanceof|typeof|void|with|yield|break|case|catch|continue|default|delete|else|finally|for|if|in|instanceof|new|return|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|package|private|protected|public|static|interface|as|is|declare|module|namespace|of|get|set)\b/g;
    const comment_regex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
    const number_regex = /\b\d+(\.\d+)?\b/g;
    const function_declaration_regex = /\b(function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const variable_regex = /\b(?!const|let|var|function|if|else|for|while|return|import|export|from|async|await|class|extends|super|new|this|true|false|null|undefined|debugger|do|in|instanceof|typeof|void|with|yield|break|case|catch|continue|default|delete|else|finally|for|if|in|instanceof|new|return|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|package|private|protected|public|static|interface|as|is|declare|module|namespace|of|get|set)([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const operator_regex = /(\+\+|--|\*\*|\*|\/|%|\+\-|-|\+\=|\-\=|\*\=|\/\=|%\=|\=\=|\!\=|\=\=\=|\!\=\=|\>|\<|\>\=|\<\=|\&\&|\|\||\!|\&|\||\^|~|\<\<|\>\>|\>\>\>|\?|:|\=)/g;
    const punctuation_regex = /([\{\}\[\]\(\);,.:])/g;

    apply_regex(content, offset, builder, document, keyword_regex, 'keyword');
    apply_regex(content, offset, builder, document, comment_regex, 'comment');
    apply_regex(content, offset, builder, document, number_regex, 'number');
    apply_regex(content, offset, builder, document, function_declaration_regex, 'function'); // For function declarations
    apply_regex(content, offset, builder, document, variable_regex, 'variable'); // For general variables
    apply_regex(content, offset, builder, document, operator_regex, 'operator');
    apply_regex(content, offset, builder, document, punctuation_regex, 'punctuation');
}
