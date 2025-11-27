import type { Kire, Node, DirectiveDefinition } from 'kire';
import './types'; // This is for module augmentation

export class AnalyticalParser {
  private cursor = 0;
  private line = 1;
  private column = 1;
  private stack: Node[] = [];
  private rootChildren: Node[] = [];

  constructor(private template: string, private kire: Kire, private source = 'template') {}

  private getPosition() {
    return { line: this.line, column: this.column, offset: this.cursor };
  }

  public parse(): Node[] {
    this.cursor = 0;
    this.stack = [];
    this.rootChildren = [];
    
    while (this.cursor < this.template.length) {
      const remaining = this.template.slice(this.cursor);
      const startPos = this.getPosition();

      // Check for interpolation {{ ... }}
      const interpolationMatch = remaining.match(/^\{\{([\s\S]*?)\}\}/);
      if (interpolationMatch) {
        const fullMatch = interpolationMatch[0];
        const content = interpolationMatch[1]!.trim();
        this.advance(fullMatch);
        const endPos = this.getPosition();
        this.addNode({
          type: 'variable',
          content: content,
          start: startPos.offset,
          end: endPos.offset,
          loc: { source: this.source, start: startPos, end: endPos },
        });
        continue;
      }

      // Check for escaped directive @@
      if (remaining.startsWith('@@')) {
          this.advance('@@');
          const endPos = this.getPosition();
          this.addNode({
              type: 'text',
              content: '@',
              start: startPos.offset,
              end: endPos.offset,
              loc: { source: this.source, start: startPos, end: endPos },
          });
          continue;
      }

      // Check for directive @name(...)
      const directiveMatch = remaining.match(/^@(\w+)(?:\(([^)]*)\))?/);
      if (directiveMatch) {
        const [fullMatch, name, argsStr] = directiveMatch;
        
        if (name === 'end') {
            const popped = this.handleEndDirective();
            if (popped) {
                this.advance(fullMatch);
                popped.end = this.cursor;
                if (popped.loc) popped.loc.end = this.getPosition();
            } else {
                this.advance(fullMatch);
            }
            continue;
        }

        const directiveDef = this.kire.getDirective(name!);
        
        // Check for sub-directive (parent logic)
        if (this.stack.length > 0) {
            const currentParent = this.stack[this.stack.length - 1];
            const parentDef = this.kire.getDirective(currentParent!.name!);
            
            if (parentDef?.parents) {
                const subDef = parentDef.parents.find(p => p.name === name);
                if (subDef) {
                    this.handleSubDirective(name!, argsStr, fullMatch, currentParent!, subDef, startPos);
                    this.advance(fullMatch);
                    continue;
                }
            }
        }

        // If not a registered directive treat as text
        if (!directiveDef) {
             this.advance(fullMatch);
             const endPos = this.getPosition();
             this.addNode({
                 type: 'text',
                 content: fullMatch,
                 start: startPos.offset,
                 end: endPos.offset,
                 loc: { source: this.source, start: startPos, end: endPos },
             });
             continue;
        }

        const args = argsStr ? this.parseArgs(argsStr) : [];
        const endPos = this.getPosition();

        const node: Node = {
          type: 'directive',
          name: name,
          args: args,
          start: startPos.offset,
          end: endPos.offset,
          loc: { source: this.source, start: startPos, end: endPos },
          children: [],
          related: []
        };
        this.addNode(node);

        if (directiveDef.children) {
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
        this.advance(remaining);
        const endPos = this.getPosition();
        this.addNode({
          type: 'text',
          content: remaining,
          start: startPos.offset,
          end: endPos.offset,
          loc: { source: this.source, start: startPos, end: endPos },
        });
      } else {
        const text = remaining.slice(0, nextIndex > 0 ? nextIndex : 1);
        this.advance(text);
        const endPos = this.getPosition();
        this.addNode({
          type: 'text',
          content: text,
          start: startPos.offset,
          end: endPos.offset,
          loc: { source: this.source, start: startPos, end: endPos },
        });
      }
    }
    
    return this.rootChildren;
  }

  private handleEndDirective(): Node | undefined {
      if (this.stack.length === 0) return undefined;
      const popped = this.stack.pop();
      
      if (this.stack.length > 0) {
          const parent = this.stack[this.stack.length - 1];
          if (parent?.related?.includes(popped!)) {
              // This is a chained directive like `@elseif`, so its parent (`@if`) should be closed by the same `@end`
              return this.stack.pop();
          }
      }
      return popped;
  }

  private handleSubDirective(name: string, argsStr: string | undefined, fullMatch: string, parentNode: Node, subDef: DirectiveDefinition, startPos: any) {
      const args = argsStr ? this.parseArgs(argsStr) : [];
      this.advance(fullMatch);
      const endPos = this.getPosition();
      
      const node: Node = {
          type: 'directive',
          name: name,
          args: args,
          start: startPos.offset,
          end: endPos.offset,
          loc: { source: this.source, start: startPos, end: endPos },
          children: [],
          related: []
      };
      
      parentNode.related ??= [];
      parentNode.related.push(node);
      
      if (subDef.children) {
          // Pop the parent `if` and push the `elseif`
          this.stack.pop();
          this.stack.push(parentNode);
          this.stack.push(node);
      }
  }

  private addNode(node: Node) {
      if (this.stack.length > 0) {
          const current = this.stack[this.stack.length - 1];
          current!.children ??= [];
          current!.children.push(node);
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
         if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
             return arg.slice(1, -1);
         }
         if (arg === 'true') return true;
         if (arg === 'false') return false;
         if (!isNaN(Number(arg))) return Number(arg);
         return arg;
     });
  }
}
