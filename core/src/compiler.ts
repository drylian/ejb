import type { Kire } from "./kire";
import type { KireContext, Node } from "./types";

export class Compiler {
    private preBuffer: string[] = [];
    private resBuffer: string[] = [];
    private posBuffer: string[] = [];
    // Removed gPreBuffer and gPosBuffer

    private usedDirectives: Set<string> = new Set();

    constructor(private kire: Kire) {}

    public async compile(nodes: Node[]): Promise<string> {
        this.preBuffer = [];
        this.resBuffer = [];
        this.posBuffer = [];
        // Removed gPreBuffer and gPosBuffer init
        this.usedDirectives.clear();

        // Compile the root nodes
        await this.compileNodes(nodes);

        // gPre and gPos are now collected at runtime via generated code
        const pre = this.preBuffer.join("\n");
        const res = this.resBuffer.join("\n");
        const pos = this.posBuffer.join("\n");

        // Main function body code
        const code = `with($ctx) { \n${pre}\n${res}\n${pos}\nreturn $ctx;\n }`;

        return code;
    }

    private async compileNodes(nodes: Node[]) {
        let i = 0;
        while (i < nodes.length) {
            const node = nodes[i]!;
            if (node.type === "text") {
                if (node.content) {
                    this.resBuffer.push(
                        `$ctx['~res'] += ${JSON.stringify(node.content)};`,
                    );
                }
            } else if (node.type === "variable") {
                if (node.content) {
                    if (node.raw) {
                        this.resBuffer.push(
                            `$ctx['~res'] += (${node.content});`,
                        );
                    } else {
                        this.resBuffer.push(
                            `$ctx['~res'] += $ctx.$escape(${node.content});`,
                        );
                    }
                }
            } else if (node.type === "directive") {
                await this.processDirective(node);
            }
            i++;
        }
    }

    private async processDirective(node: Node) {
        const name = node.name;
        if (!name) return;

        // Check if directive exists in Kire instance
        const directive = this.kire.getDirective(name);

        if (!directive) {
            // Handle unknown directive
            console.warn(`Directive @${name} not found.`);
            return;
        }

        const ctx: KireContext = {
            param: (key: string | number) => {
                if (typeof key === "number") {
                    return node.args?.[key];
                }
                if (directive.params && node.args) {
                    const index = directive.params.findIndex(
                        (p) => p.split(":")[0] === key,
                    );
                    if (index !== -1) return node.args[index];
                }
                return undefined;
            },
            children: node.children,
            parents: node.related, // 'parents' in user logic map to 'related' nodes from parser
            set: async (nodes: Node[]) => {
                if (!nodes) return;
                await this.compileNodes(nodes);
            },
            render: async (content: string) => {
                // This needs to return the object {code, gPre, gPos}
                // But compile expects string for now.
                return (await this.kire.compile(content)); 
            },
            resolve: (path: string) => {
                return this.kire.resolvePath(path);
            },
            func: (code: string) => {
                return `async function($ctx) { ${code} }`;
            },
            pre: (code: string) => {
                this.preBuffer.push(code);
            },
            res: (content: string) => {
                const escaped = content
                    .replace(/\\/g, "\\\\")
                    .replace(/`/g, "\\`")
                    .replace(/\${/g, "\\${ ");
                this.resBuffer.push(`$ctx.res(\`${escaped}\`);`);
            },
            raw: (code: string) => {
                this.resBuffer.push(code);
            },
            pos: (code: string) => {
                this.posBuffer.push(code);
            },
            $pre: (code: string) => {
                this.resBuffer.push(`$ctx['~$pre'].push(async ($ctx) => { with($ctx) { ${code} } });`);
            },
            $pos: (code: string) => {
                this.resBuffer.push(`$ctx['~$pos'].push(async ($ctx) => { with($ctx) { ${code} } });`);
            },
            error: (msg: string) => {
                throw new Error(`Error in directive @${name}: ${msg}`);
            },
        };

        if (directive.once && !this.usedDirectives.has(name)) {
            this.usedDirectives.add(name);
            await directive.once(ctx);
        }

        await directive.onCall(ctx);
    }
}