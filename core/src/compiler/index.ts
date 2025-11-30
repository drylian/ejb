import type { Kire } from "../kire";
import type { KireContext, Node } from "../types";

// Define the symbols for internal use
export const RESPONSE_SYMBOL = Symbol.for("~response");
export const STRUCTURE_SYMBOL = Symbol.for("~structure");

export class Compiler {
	private preBuffer: string[] = [];
	private resBuffer: string[] = [];
	private posBuffer: string[] = [];

	constructor(private kire: Kire) {}

	public async compile(nodes: Node[]): Promise<string> {
		this.preBuffer = [];
		this.resBuffer = [];
		this.posBuffer = [];

		this.resBuffer.push(`with($ctx) {`);

		// Hook: onBewareDirectives
		if (this.kire.hooks?.onBewareDirectives) {
			if (Array.isArray(this.kire.hooks.onBewareDirectives)) {
				for (const hook of this.kire.hooks.onBewareDirectives) {
					const injected = hook(this);
					if (typeof injected === "string") {
						this.resBuffer.push(injected);
					}
				}
			} else {
				const injected = this.kire.hooks.onBewareDirectives(this);
				if (typeof injected === "string") {
					this.resBuffer.push(injected);
				}
			}
		}

		// Compile the root nodes
		await this.compileNodes(nodes);

		this.resBuffer.push(`}`); // Close with($ctx)

		const pre = this.preBuffer.join("\n");
		const res = this.resBuffer.join("\n");
		const pos = this.posBuffer.join("\n");

		// Return statement must be last
		const ret = `return $ctx;`;

		return `${pre}\n${res}\n${pos}\n${ret}`;
	}

	private async compileNodes(nodes: Node[]) {
		for (const node of nodes) {
			if (node.type === "text") {
				if (node.content) {
					this.resBuffer.push(
						`$ctx[Symbol.for('~response')] += ${JSON.stringify(node.content)};`,
					);
				}
			} else if (node.type === "variable") {
				if (node.content) {
					// Simple interpolation
					this.resBuffer.push(
						`$ctx[Symbol.for('~response')] += (${node.content});`,
					);
				}
			} else if (node.type === "directive") {
				await this.processDirective(node);
			}
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
				return this.kire.compile(content);
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
				this.resBuffer.push(`$ctx.res(\`${content}\`);`);
			},
			raw: (code: string) => {
				this.resBuffer.push(code);
			},
			pos: (code: string) => {
				this.posBuffer.push(code);
			},
			error: (msg: string) => {
				throw new Error(`Error in directive @${name}: ${msg}`);
			},
			clone: (locals: Record<string, any> = {}) => {
				this.resBuffer.push(`$ctx.clone(${JSON.stringify(locals)});`);
				return ctx;
			},
			clear: () => {
				this.resBuffer.push(`$ctx.clear();`);
				return ctx;
			},
		};

		await directive.onCall(ctx);
	}
}
