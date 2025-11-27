import type { Node, DirectiveDefinition } from '../types';
import type { Kire } from '../kire';

export class Parser {
  private cursor = 0;
  private line = 1;
  private column = 1;
  private stack: Node[] = [];
  private rootChildren: Node[] = [];

  constructor(private template: string, private kire: Kire) {}

  public parse(): Node[] {
    this.cursor = 0;
    this.stack = [];
    this.rootChildren = [];
    
    while (this.cursor < this.template.length) {
      const remaining = this.template.slice(this.cursor);
      // console.log('PARSER:', { cursor: this.cursor, remaining: remaining.slice(0, 20) });
      
      // Check for interpolation {{ ... }}
      const interpolationMatch = remaining.match(/^\{\{([\s\S]*?)\}\}/);
      if (interpolationMatch) {
        this.addNode({
          type: 'variable',
          content: interpolationMatch[1]!.trim(),
          start: this.cursor,
          end: this.cursor + interpolationMatch[0].length
        });
        this.advance(interpolationMatch[0]);
        continue;
      }

      // Check for escaped directive @@
      if (remaining.startsWith('@@')) {
          this.addNode({
              type: 'text',
              content: '@',
              start: this.cursor,
              end: this.cursor + 2
          });
          this.advance('@@');
          continue;
      }

      // Check for directive @name(...)
      // Regex: @(\w+)(?:\(([^)]*)\))?
      const directiveMatch = remaining.match(/^@(\w+)(?:\(([^)]*)\))?/);
      if (directiveMatch) {
        const [fullMatch, name, argsStr] = directiveMatch;
        
        if (name === 'end') {
            this.handleEndDirective();
            this.advance(fullMatch);
            continue;
        }

        const directiveDef = this.kire.getDirective(name!);
        
        // Check for sub-directive (parent logic)
        let isSubDirective = false;
        if (this.stack.length > 0) {
            const currentParent = this.stack[this.stack.length - 1];
            const parentDef = this.kire.getDirective(currentParent!.name!);
            
            if (parentDef && parentDef.parents) {
                const subDef = parentDef.parents.find(p => p.name === name);
                if (subDef) {
                    this.handleSubDirective(name!, argsStr, fullMatch, currentParent!, subDef);
                    this.advance(fullMatch);
                    continue;
                }
            }
        }

        // If not a registered directive and not a sub-directive, treat as text
        if (!directiveDef && !isSubDirective) {
             this.addNode({
                 type: 'text',
                 content: fullMatch,
                 start: this.cursor,
                 end: this.cursor + fullMatch.length
             });
             this.advance(fullMatch);
             continue;
        }

        const args = argsStr ? this.parseArgs(argsStr) : [];
        
        const node: Node = {
          type: 'directive',
          name: name,
          args: args,
          start: this.cursor,
          end: this.cursor + fullMatch.length,
          children: [],
          related: []
        };

        this.addNode(node);
        
        if (directiveDef && directiveDef.children) {
            if (directiveDef.childrenRaw) {
                this.stack.push(node);
                
                const contentStart = this.cursor + fullMatch.length;
                const remainingTemplate = this.template.slice(contentStart);
                
                // Find closing @end with word boundary check
                const endMatch = remainingTemplate.match(/@end(?![a-zA-Z0-9_])/);
                
                if (endMatch) {
                    const content = remainingTemplate.slice(0, endMatch.index);
                    
                    // Add text node
                    this.addNode({
                        type: 'text',
                        content: content,
                        start: contentStart,
                        end: contentStart + content.length
                    });
                    
                    this.stack.pop(); // Close immediately
                    this.advance(fullMatch + content + endMatch[0]);
                    continue;
                } else {
                     // No end tag found, consume rest
                     const content = remainingTemplate;
                     this.addNode({
                         type: 'text',
                         content: content,
                         start: contentStart,
                         end: this.template.length
                     });
                     this.stack.pop();
                     this.advance(fullMatch + content);
                     continue;
                }
            }
            this.stack.push(node);
        }
        
        this.advance(fullMatch);
        continue;
      }

      // Text
      const nextInterpolation = remaining.indexOf('{{');
      const nextDirective = remaining.indexOf('@');
      
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
          type: 'text',
          content: remaining,
          start: this.cursor,
          end: this.template.length
        });
        this.advance(remaining);
      } else {
        if (nextIndex === 0) {
             this.addNode({
                 type: 'text',
                 content: remaining[0],
                 start: this.cursor,
                 end: this.cursor + 1
             });
             this.advance(remaining[0]!);
        } else {
             const text = remaining.slice(0, nextIndex);
             this.addNode({
               type: 'text',
               content: text,
               start: this.cursor,
               end: this.cursor + text.length
             });
             this.advance(text);
        }
      }
    }
    
    return this.rootChildren;
  }

  private handleEndDirective() {
      if (this.stack.length === 0) return;
      const popped = this.stack.pop();
      
      // If we popped a 'related' directive (like elseif),
      // we check if we need to pop its parent (the if) too.
      // However, the logic is slightly tricky:
      // 1. stack=[if]. elseif comes.
      // 2. handleSubDirective adds elseif to if.related AND pushes elseif to stack. stack=[if, elseif].
      // 3. elseif collects children.
      // 4. @end comes. Pop elseif. stack=[if].
      // 5. Since elseif IS a related directive of 'if', 'if' logic is now done too?
      //    Usually: @if ... @elseif ... @end
      //    The @end closes the whole block.
      //    So yes, we should pop 'if' too.
      
      if (this.stack.length > 0) {
          const parent = this.stack[this.stack.length - 1];
          if (parent && parent.related && parent.related.includes(popped!)) {
              this.stack.pop();
          }
      }
  }

  private handleSubDirective(name: string, argsStr: string | undefined, fullMatch: string, parentNode: Node, subDef: DirectiveDefinition) {
      const args = argsStr ? this.parseArgs(argsStr) : [];
      
      const node: Node = {
          type: 'directive',
          name: name,
          args: args,
          start: this.cursor,
          end: this.cursor + fullMatch.length,
          children: [],
          related: []
      };
      
      if (!parentNode.related) parentNode.related = [];
      parentNode.related.push(node);
      
      if (subDef.children) {
          this.stack.push(node);
      }
  }

  private addNode(node: Node) {
      if (this.stack.length > 0) {
          const current = this.stack[this.stack.length - 1];
          if (current && !current.children) current.children = [];
          if(current?.children)current.children.push(node);
      } else {
          this.rootChildren.push(node);
      }
  }

  private advance(str: string) {
    const lines = str.split('\n');
    if (lines.length > 1) {
      this.line += lines.length - 1;
      this.column = lines[lines.length - 1]!.length + 1;
    } else {
      this.column += str.length;
    }
    this.cursor += str.length;
  }

  private parseArgs(argsStr: string): any[] {
     const args: any[] = [];
     let current = '';
     let inQuote = false;
     let quoteChar = '';
     let braceDepth = 0;
     let bracketDepth = 0;
     let parenDepth = 0;
     
     for (let i = 0; i < argsStr.length; i++) {
       const char = argsStr[i];
       
       // Handle quotes
       if ((char === '"' || char === "'") && (i === 0 || argsStr[i-1] !== '\\')) {
         if (inQuote && char === quoteChar) {
           inQuote = false;
         } else if (!inQuote) {
           inQuote = true;
           quoteChar = char;
         }
       }
       
       if (!inQuote) {
           if (char === '{') braceDepth++;
           else if (char === '}') braceDepth--;
           else if (char === '[') bracketDepth++;
           else if (char === ']') bracketDepth--;
           else if (char === '(') parenDepth++;
           else if (char === ')') parenDepth--;
       }
       
       if (char === ',' && !inQuote && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
         args.push(current.trim());
         current = '';
       } else {
         current += char;
       }
     }
     if (current) args.push(current.trim());
     
     return args.map(arg => {
         if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'" ) && arg.endsWith("'"))) {
             return arg.slice(1, -1);
         }
         if (arg === 'true') return true;
         if (arg === 'false') return false;
         if (!isNaN(Number(arg))) return Number(arg);
         return arg;
     });
  }
}