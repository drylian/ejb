import type { Kire } from "./kire";
import type { DirectiveDefinition, Node } from "./types";

export class Parser {
    private cursor = 0;
    private stack: Node[] = [];
    private rootChildren: Node[] = [];
    public line = 1;
    public column = 1;

    constructor(
        private template: string,
        private kire: Kire,
    ) {}

    public parse(): Node[] {
        this.cursor = 0;
        this.stack = [];
        this.rootChildren = [];

        while (this.cursor < this.template.length) {
            const remaining = this.template.slice(this.cursor);
            //console.log('PARSER:', {
            //  cursor: this.cursor,
            //  remaining: remaining.slice(0, 30),
            //  stack: this.stack.map(s => s.name)
            //});

            // Check for raw interpolation {{{ ... }}}
            const rawInterpolationMatch = remaining.match(/^\{\{\{([\s\S]*?)\}\}\}/);
            if (rawInterpolationMatch) {
                const content = rawInterpolationMatch[0];
                this.addNode({
                    type: "variable",
                    content: rawInterpolationMatch[1]?.trim(),
                    raw: true,
                    start: this.cursor,
                    end: this.cursor + content.length,
                    loc: this.getLoc(content),
                });
                this.advance(content);
                continue;
            }

            // Check for interpolation {{ ... }}
            const interpolationMatch = remaining.match(/^\{\{([\s\S]*?)\}\}/);
            if (interpolationMatch) {
                const content = interpolationMatch[0];
                this.addNode({
                    type: "variable",
                    content: interpolationMatch[1]?.trim(),
                    raw: false,
                    start: this.cursor,
                    end: this.cursor + content.length,
                    loc: this.getLoc(content),
                });
                this.advance(content);
                continue;
            }

            // Check for escaped directive @@
            if (remaining.startsWith("@@")) {
                this.addNode({
                    type: "text",
                    content: "@",
                    start: this.cursor,
                    end: this.cursor + 2,
                    loc: this.getLoc("@@"),
                });
                this.advance("@@");
                continue;
            }

            // Check for directive @name(...) or @name without parentheses
            // Use longest matching directive name first
            const directiveStartMatch = remaining.match(/^@([a-zA-Z0-9_]+)/);
            if (directiveStartMatch) {
                let [fullMatch, name] = directiveStartMatch;

                // 1. First, check if this is a sub-directive of any active parent in the stack.
                // This takes precedence over global directives and prefix matching in global scope.
                // We iterate backwards to find the nearest parent that accepts this as a sub-directive.
                let isSubDirective = false;
                let subDef: DirectiveDefinition | undefined;
                let parentNode: Node | undefined;
                let validName = name;
                let foundDirective: DirectiveDefinition | undefined;

                if (this.stack.length > 0) {
                    for (let i = this.stack.length - 1; i >= 0; i--) {
                        const currentParent = this.stack[i];
                        const parentDef = this.kire.getDirective(currentParent?.name as string);

                        if (parentDef?.parents) {
                             // Try to match name against parents
                             // Sort by length to support longest prefix if needed? 
                             // Usually sub-directives are exact matches or strict aliases.
                             // But if we support @elseA (unlikely for strict keywords), we might need prefix logic here too.
                             // Let's assume strict match for sub-directives for now, or prefix if needed.
                             
                             const candidates = parentDef.parents.filter(p => name.startsWith(p.name));
                             candidates.sort((a, b) => b.name.length - a.name.length);
                             
                             if (candidates.length > 0) {
                                 const p = candidates[0];
                                 // Check if we found a valid prefix match
                                 // Update validName
                                 validName = p.name;
                                 subDef = p;
                                 parentNode = currentParent;
                                 isSubDirective = true;
                                 
                                 // Since we found a match at stack[i], we must close all blocks above it (siblings)
                                 // e.g. [if, elseif]. Match at [if]. Close [elseif].
                                 while (this.stack.length > i + 1) {
                                     this.stack.pop();
                                 }
                                 break;
                             }
                        }
                    }
                }

                // 2. If not a sub-directive, check global directives with prefix matching
                if (!isSubDirective) {
                    foundDirective = this.kire.getDirective(name);
                    
                    if (!foundDirective) {
                         const allDirectives = Array.from(this.kire.$directives.values()).sort((a, b) => b.name.length - a.name.length);
                         for (const d of allDirectives) {
                             if (name.startsWith(d.name)) {
                                 validName = d.name;
                                 foundDirective = d;
                                 break;
                             }
                         }
                    }
                }

                // Update fullMatch if we matched a shorter name (prefix)
                if (validName !== name) {
                     name = validName;
                     fullMatch = "@" + name;
                } else if (!foundDirective && !isSubDirective && name === "end") {
                     // Keep "end"
                } else if (!isSubDirective && !foundDirective) {
                     // Try exact fetch again just in case
                     foundDirective = this.kire.getDirective(name);
                }

                //console.log('FOUND DIRECTIVE:', { name, fullMatch, stack: this.stack.map(s => s.name) });

                // Check if it has arguments
                let argsStr: string | undefined;
                let argsEndIndex = fullMatch.length;

                // Verifica se tem parênteses APENAS se o próximo caractere for '('
                if (remaining[fullMatch.length] === "(") {
                    // Parse arguments with balanced parentheses
                    let depth = 1;
                    let i = fullMatch.length + 1;
                    let inQuote = false;
                    let quoteChar = "";

                    while (i < remaining.length && depth > 0) {
                        const char = remaining[i];
                        if (
                            (char === '"' || char === "'") &&
                            (i === 0 || remaining[i - 1] !== "\\")
                        ) {
                            if (inQuote && char === quoteChar) {
                                inQuote = false;
                            } else if (!inQuote) {
                                inQuote = true;
                                quoteChar = char;
                            }
                        }

                        if (!inQuote) {
                            if (char === "(") depth++;
                            else if (char === ")") depth--;
                        }
                        i++;
                    }

                    if (depth === 0) {
                        argsStr = remaining.slice(fullMatch.length + 1, i - 1);
                        argsEndIndex = i;
                    }
                }

                if (name === "end") {
                    //console.log('HANDLING END DIRECTIVE');
                    this.handleEndDirective();
                    this.advance(remaining.slice(0, argsEndIndex));
                    continue;
                }

                // directiveDef is already found as foundDirective
                const directiveDef = foundDirective;
                //console.log('DIRECTIVE DEF:', { name, directiveDef });

                if (isSubDirective && subDef && parentNode) {
                            //console.log('FOUND SUB DIRECTIVE! Processing:', name);
                            const fullContent = remaining.slice(0, argsEndIndex);
                            this.handleSubDirective(
                                name!,
                                argsStr,
                                fullContent,
                                parentNode,
                                subDef,
                                this.getLoc(fullContent),
                            );
                            this.advance(fullContent);
                            continue;
                }

                // If not a registered directive and not a sub-directive, treat as text
                if (!directiveDef && !isSubDirective) {
                    //console.log('TREATING AS TEXT:', name);
                    this.addNode({
                        type: "text",
                        content: fullMatch,
                        start: this.cursor,
                        end: this.cursor + fullMatch.length,
                        loc: this.getLoc(fullMatch),
                    });
                    this.advance(fullMatch);
                    continue;
                }

                const args = argsStr ? this.parseArgs(argsStr) : [];
                const fullContent = remaining.slice(0, argsEndIndex);

                const node: Node = {
                    type: "directive",
                    name: name,
                    args: args,
                    start: this.cursor,
                    end: this.cursor + argsEndIndex,
                    loc: this.getLoc(fullContent),
                    children: [],
                    related: [],
                };

                //console.log('ADDING DIRECTIVE NODE:', node);
                this.addNode(node);

                if (directiveDef?.children) {
                    let shouldHaveChildren = true;
                    if (directiveDef.children === "auto") {
                        // Check if there is a matching @end for this directive at this level
                        // Simple heuristic: search for @end, counting nested directives of same name?
                        // Actually, just checking if an @end exists before end of string might be enough for basic cases,
                        // but correct handling requires lookahead balancing.
                        
                        // We need to look ahead to see if this directive is closed.
                        // If we find an @end that corresponds to this level, treat as block.
                        // If not, treat as void.
                        
                        // BUT, if we just assume "auto" means "block if @end found",
                        // we need to be careful about nested blocks.
                        
                        // Heuristic: Scan ahead. 
                        // Count open same-name directives? No, generic @end closes any block.
                        // So we scan for @directive vs @end.
                        
                        let balance = 1;
                        let lookaheadCursor = argsEndIndex; // Relative to remaining
                        let foundEnd = false;
                        
                        const subRemaining = remaining.slice(lookaheadCursor);
                        
                        // Regex to find directives
                        const tagRegex = /@([a-zA-Z0-9_]+)/g;
                        let match;
                        
                        while ((match = tagRegex.exec(subRemaining)) !== null) {
                            const tagName = match[1];
                            if (tagName === "end") {
                                balance--;
                                if (balance === 0) {
                                    foundEnd = true;
                                    break;
                                }
                            } else {
                                // Check if this tag is a block directive
                                const d = this.kire.getDirective(tagName);
                                // If we don't know it, ignore? Or treat as text?
                                // If it IS a block directive, increment balance.
                                if (d?.children) {
                                    balance++;
                                }
                            }
                        }
                        
                        shouldHaveChildren = foundEnd;
                    }

                    if (shouldHaveChildren) {
                        if (directiveDef.childrenRaw) {
                            this.stack.push(node);

                            const contentStart = this.cursor + argsEndIndex;
                            const remainingTemplate = this.template.slice(contentStart);

                            // Update cursor temporarily to calculate correct loc for raw content
                            // We need to advance virtually to get correct start loc for content
                            const directiveLoc = this.getLoc(fullContent);
                            // Actually we can't easily use getLoc because it depends on this.line/column which haven't advanced yet.
                            // We must advance after adding directive node but BEFORE processing raw content.
                            // Wait, we addNode(directive) then advance(directive) then process content?
                            // The current logic: addNode -> stack push -> then advance? No.
                            
                            // Current flow:
                            // 1. addNode(directive)
                            // 2. if childrenRaw:
                            //    stack.push
                            //    find end
                            //    addNode(text)
                            //    stack.pop
                            //    advance(directive + text + end)
                            
                            // This makes `this.line` stale for the text node inside childrenRaw block.
                            // We need to calculate text node loc relative to where directive ends.
                            
                            // Find closing @end with word boundary check
                            const endMatch = remainingTemplate.match(/@end(?![a-zA-Z0-9_])/);

                            if (endMatch) {
                                const content = remainingTemplate.slice(0, endMatch.index);
                                
                                // Calculate loc for the inner content
                                // Start is end of directive
                                const startLoc = directiveLoc.end;
                                // End is calculated from content
                                const contentLines = content.split('\n');
                                let endLine = startLoc.line;
                                let endCol = startLoc.column;
                                if (contentLines.length > 1) {
                                    endLine += contentLines.length - 1;
                                    endCol = (contentLines[contentLines.length - 1]?.length || 0) + 1;
                                } else {
                                    endCol += content.length;
                                }

                                // Add text node
                                this.addNode({
                                    type: "text",
                                    content: content,
                                    start: contentStart,
                                    end: contentStart + content.length,
                                    loc: { start: startLoc, end: { line: endLine, column: endCol } }
                                });

                                this.stack.pop(); // Close immediately
                                this.advance(
                                    remaining.slice(0, argsEndIndex) + content + endMatch[0],
                                );
                                continue;
                            } else {
                                // No end tag found, consume rest
                                const content = remainingTemplate;
                                
                                this.addNode({
                                    type: "text",
                                    content: content,
                                    start: contentStart,
                                    end: this.template.length,
                                    // loc: ... (omitted for simplicity in error case)
                                });
                                this.stack.pop();
                                this.advance(remaining.slice(0, argsEndIndex) + content);
                                continue;
                            }
                        }
                        //console.log('PUSHING TO STACK:', name);
                        this.stack.push(node);
                    }
                }

                this.advance(remaining.slice(0, argsEndIndex));
                continue;
            }

            // Text
            const nextInterpolation = remaining.indexOf("{{");
            const nextDirective = remaining.indexOf("@");

            let nextIndex = -1;
            if (nextInterpolation !== -1 && nextDirective !== -1) {
                nextIndex = Math.min(nextInterpolation, nextDirective);
            } else if (nextInterpolation !== -1) {
                nextIndex = nextInterpolation;
            } else if (nextDirective !== -1) {
                nextIndex = nextDirective;
            }

            if (nextIndex === -1) {
                this.addNode({
                    type: "text",
                    content: remaining,
                    start: this.cursor,
                    end: this.template.length,
                    loc: this.getLoc(remaining),
                });
                this.advance(remaining);
            } else {
                if (nextIndex === 0) {
                    const char = remaining[0]!;
                    this.addNode({
                        type: "text",
                        content: char,
                        start: this.cursor,
                        end: this.cursor + 1,
                        loc: this.getLoc(char),
                    });
                    this.advance(char);
                } else {
                    const text = remaining.slice(0, nextIndex);
                    this.addNode({
                        type: "text",
                        content: text,
                        start: this.cursor,
                        end: this.cursor + text.length,
                        loc: this.getLoc(text),
                    });
                    this.advance(text);
                }
            }
        }

        //console.log('FINAL RESULT:', JSON.stringify(this.rootChildren, null, 2));
        return this.rootChildren;
    }

    private handleEndDirective() {
        //console.log('HANDLE END - Stack before:', this.stack.map(s => s.name));
        if (this.stack.length > 0) {
            const popped = this.stack.pop();
            
            // Check if the popped node was a sub-directive (related) of the current parent
            // If so, it means we closed the sub-directive (like @else), and thus we should close the parent (@if) too.
            // This is the default behavior for related directives (chains).
            if (this.stack.length > 0) {
                const parent = this.stack[this.stack.length - 1];
                if (parent?.related?.includes(popped!)) {
                    this.stack.pop(); // Close parent
                }
            }
        }
        //console.log('HANDLE END - Popped:', popped?.name);
        //console.log('HANDLE END - Stack after:', this.stack.map(s => s.name));
    }

    private handleSubDirective(
        name: string,
        argsStr: string | undefined,
        fullMatch: string,
        parentNode: Node,
        subDef: DirectiveDefinition,
        loc: any,
    ) {
        const args = argsStr ? this.parseArgs(argsStr) : [];

        const node: Node = {
            type: "directive",
            name: name,
            args: args,
            start: this.cursor,
            end: this.cursor + fullMatch.length,
            loc: loc,
            children: [],
            related: [],
        };

        // If the current top of stack is already a related node of the parent (e.g. we are in @elseif and found @else),
        // we need to close the current sibling (@elseif) before opening the new one (@else).
        // Use the parentNode passed in, which was found by searching the stack.
        if (this.stack.length > 0) {
            const currentTop = this.stack[this.stack.length - 1];
            // Check if currentTop is a sibling (i.e. it is in parentNode.related)
            if (parentNode.related?.includes(currentTop!)) {
                this.stack.pop();
            }
        }

        //console.log('HANDLING SUB DIRECTIVE:', {
        //  name,
        //  parent: parentNode.name,
        //  node,
        //  parentRelated: parentNode.related
        //});

        if (!parentNode.related) parentNode.related = [];
        parentNode.related.push(node);

        if (subDef.children) {
            //console.log('PUSHING SUB DIRECTIVE TO STACK:', name);
            this.stack.push(node);
        }
    }

    private getLoc(content: string) {
        const start = { line: this.line, column: this.column };
        const lines = content.split("\n");
        let endLine = this.line;
        let endColumn = this.column;

        if (lines.length > 1) {
            endLine += lines.length - 1;
            endColumn = (lines[lines.length - 1]?.length || 0) + 1;
        } else {
            endColumn += content.length;
        }

        return {
            start,
            end: { line: endLine, column: endColumn },
        };
    }

    private addNode(node: Node) {
        if (this.stack.length > 0) {
            const current = this.stack[this.stack.length - 1];
            if (current && !current.children) current.children = [];
            if (current?.children) {
                //console.log('ADDING TO CHILDREN of', current.name, ':', node.type, node.name || node.content);
                current.children.push(node);
            }
        } else {
            //console.log('ADDING TO ROOT:', node.type, node.name || node.content);
            this.rootChildren.push(node);
        }
    }

    private advance(str: string) {
        const lines = str.split("\n");
        if (lines.length > 1) {
            this.line += lines.length - 1;
            this.column = (lines[lines.length - 1]?.length || 0) + 1;
        } else {
            this.column += str.length;
        }
        this.cursor += str.length;
    }

    private parseArgs(argsStr: string): any[] {
        const args: any[] = [];
        let current = "";
        let inQuote = false;
        let quoteChar = "";
        let braceDepth = 0;
        let bracketDepth = 0;
        let parenDepth = 0;

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];

            // Handle quotes
            if (
                (char === '"' || char === "'") &&
                (i === 0 || argsStr[i - 1] !== "\\")
            ) {
                if (inQuote && char === quoteChar) {
                    inQuote = false;
                } else if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                }
            }

            if (!inQuote) {
                if (char === "{") braceDepth++;
                else if (char === "}") braceDepth--;
                else if (char === "[") bracketDepth++;
                else if (char === "]") bracketDepth--;
                else if (char === "(") parenDepth++;
                else if (char === ")") parenDepth--;
            }

            if (
                char === "," &&
                !inQuote &&
                braceDepth === 0 &&
                bracketDepth === 0 &&
                parenDepth === 0
            ) {
                args.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        if (current) args.push(current.trim());

        return args.map((arg) => {
            if (
                (arg.startsWith('"') && arg.endsWith('"')) ||
                (arg.startsWith("'") && arg.endsWith("'"))
            ) {
                return arg.slice(1, -1);
            }
            if (arg === "true") return true;
            if (arg === "false") return false;
            if (!Number.isNaN(Number(arg))) return Number(arg);
            return arg;
        });
    }
}
