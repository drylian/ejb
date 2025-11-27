import { expect, test } from "bun:test";
import { Kire, type Node } from "kire";
import { AnalyticalParser } from "../src/parser";
import '../src/types'; // for module augmentation

test("AnalyticalParser should add loc information to nodes", () => {
    const kire = new Kire({
        engine: {
            parser: AnalyticalParser,
        }
    });

    const template = `Hello {{ name }}`;
    const ast = kire.parse(template) as Node[];
    // There should be two nodes: a text node and a variable node
    expect(ast.length).toBe(2);

    // Test Text Node
    const textNode = ast[0];
    expect(textNode?.type).toBe('text');
    expect(textNode?.content).toBe('Hello ');
    expect(textNode?.loc).toBeDefined();
    expect(textNode?.loc?.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(textNode?.loc?.end).toEqual({ line: 1, column: 7, offset: 6 });

    // Test Variable Node
    const varNode = ast[1];
    expect(varNode?.type).toBe('variable');
    expect(varNode?.content).toBe('name');
    expect(varNode?.loc).toBeDefined();
    expect(varNode?.loc?.start).toEqual({ line: 1, column: 7, offset: 6 });
    expect(varNode?.loc?.end).toEqual({ line: 1, column: 17, offset: 16 });
});

test("AnalyticalParser should handle multiline templates", () => {
    const kire = new Kire({
        engine: {
            parser: AnalyticalParser,
        }
    });

    const template = `@if(true)
  <p>Hello</p>
@end`;
    
    const ast = kire.parse(template);
    const ifNode = ast.find(n => n.type === 'directive' && n.name === 'if');

    expect(ifNode).toBeDefined();
    expect(ifNode?.loc?.start).toEqual({ line: 1, column: 1, offset: 0 });
    // The end of the node is the position after its corresponding @end tag
    expect(ifNode?.loc?.end).toEqual({ line: 3, column: 5, offset: 29 });

    expect(ifNode?.children).toBeDefined();
    expect(ifNode?.children?.length).toBe(1); // The text node `\n  <p>Hello</p>\n`

    const pNode = ifNode?.children?.[0];
    expect(pNode?.type).toBe('text');
    expect(pNode?.content).toBe('\n  <p>Hello</p>\n');
    expect(pNode?.loc?.start).toEqual({ line: 1, column: 10, offset: 9 });
    expect(pNode?.loc?.end).toEqual({ line: 3, column: 1, offset: 25 });
});
