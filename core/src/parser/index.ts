import type { Kire } from "../kire";
import type { DirectiveDefinition, Node } from "../types";

export class Parser {
	private cursor = 0;
	private stack: Node[] = [];
	private rootChildren: Node[] = [];
	private line = 1;
	private column = 1;

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

			// Check for interpolation {{ ... }}
			const interpolationMatch = remaining.match(/^\{\{([\s\S]*?)\}\}/);
			if (interpolationMatch) {
				this.addNode({
					type: "variable",
					content: interpolationMatch[1]?.trim(),
					start: this.cursor,
					end: this.cursor + interpolationMatch[0].length,
				});
				this.advance(interpolationMatch[0]);
				continue;
			}

			// Check for escaped directive @@
			if (remaining.startsWith("@@")) {
				this.addNode({
					type: "text",
					content: "@",
					start: this.cursor,
					end: this.cursor + 2,
				});
				this.advance("@@");
				continue;
			}

			// Check for directive @name(...) or @name without parentheses
			const directiveStartMatch = remaining.match(/^@(\w+)/);
			if (directiveStartMatch) {
				const [fullMatch, name] = directiveStartMatch;

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

				const directiveDef = this.kire.getDirective(name as string);
				//console.log('DIRECTIVE DEF:', { name, directiveDef });

				// Check for sub-directive (parent logic)
				let isSubDirective = false;
				if (this.stack.length > 0) {
					const currentParent = this.stack[this.stack.length - 1];
					const parentDef = this.kire.getDirective(
						currentParent?.name as string,
					);

					//console.log('CHECKING SUB DIRECTIVE:', {
					//  parent: currentParent!.name,
					//  candidate: name,
					//  parentDef: parentDef
					//});

					if (parentDef?.parents) {
						const subDef = parentDef.parents.find((p) => p.name === name);
						//console.log('SUB DIRECTIVE RESULT:', { subDef });
						if (subDef) {
							//console.log('FOUND SUB DIRECTIVE! Processing:', name);
							this.handleSubDirective(
								name!,
								argsStr,
								remaining.slice(0, argsEndIndex),
								currentParent!,
								subDef,
							);
							this.advance(remaining.slice(0, argsEndIndex));
							isSubDirective = true;
							continue;
						}
					}
				}

				// If not a registered directive and not a sub-directive, treat as text
				if (!directiveDef && !isSubDirective) {
					//console.log('TREATING AS TEXT:', name);
					this.addNode({
						type: "text",
						content: fullMatch,
						start: this.cursor,
						end: this.cursor + fullMatch.length,
					});
					this.advance(fullMatch);
					continue;
				}

				const args = argsStr ? this.parseArgs(argsStr) : [];

				const node: Node = {
					type: "directive",
					name: name,
					args: args,
					start: this.cursor,
					end: this.cursor + argsEndIndex,
					children: [],
					related: [],
				};

				//console.log('ADDING DIRECTIVE NODE:', node);
				this.addNode(node);

				if (directiveDef?.children) {
					if (directiveDef.childrenRaw) {
						this.stack.push(node);

						const contentStart = this.cursor + argsEndIndex;
						const remainingTemplate = this.template.slice(contentStart);

						// Find closing @end with word boundary check
						const endMatch = remainingTemplate.match(/@end(?![a-zA-Z0-9_])/);

						if (endMatch) {
							const content = remainingTemplate.slice(0, endMatch.index);

							// Add text node
							this.addNode({
								type: "text",
								content: content,
								start: contentStart,
								end: contentStart + content.length,
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
							});
							this.stack.pop();
							this.advance(remaining.slice(0, argsEndIndex) + content);
							continue;
						}
					}
					//console.log('PUSHING TO STACK:', name);
					this.stack.push(node);
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
				});
				this.advance(remaining);
			} else {
				if (nextIndex === 0) {
					this.addNode({
						type: "text",
						content: remaining[0],
						start: this.cursor,
						end: this.cursor + 1,
					});
					this.advance(remaining[0]!);
				} else {
					const text = remaining.slice(0, nextIndex);
					this.addNode({
						type: "text",
						content: text,
						start: this.cursor,
						end: this.cursor + text.length,
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
			this.stack.pop();
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
	) {
		const args = argsStr ? this.parseArgs(argsStr) : [];

		const node: Node = {
			type: "directive",
			name: name,
			args: args,
			start: this.cursor,
			end: this.cursor + fullMatch.length,
			children: [],
			related: [],
		};

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
