import {
	DIRECTIVE_REGEX,
	EJB_DEFAULT_PREFIX_DIRECTIVE,
	EJB_DEFAULT_PREFIX_VARIABLE,
	EJB_ESCAPED_PREFIX_DIRECTIVE,
	EjbAst,
} from "./constants";
import type { Ejb } from "./ejb";
import type {
	DirectiveNode,
	EjbError,
	Position,
	RootNode,
	SourceLocation,
	SubDirectiveNode,
} from "./types";

function createPosition(
	line: number,
	column: number,
	offset: number,
): Position {
	return { line, column, offset };
}

export function ejbParser(ejb: Ejb, template: string): RootNode {
	let line = 1,
		column = 1,
		cursor = 0;
	const root: RootNode = {
		type: EjbAst.Root,
		children: [],
		errors: [],
		loc: {
			start: createPosition(1, 1, 0),
			end: createPosition(1, 1, template.length),
		},
	};
	const stack: (RootNode | DirectiveNode | SubDirectiveNode)[] = [root];

	const [interpStart, interpEnd] = EJB_DEFAULT_PREFIX_VARIABLE.split(
		"*",
	) as string[];
	const regexDirectives = Object.values(ejb.directives).filter(
		(d) => typeof d.name !== "string",
	);

	const advance = (str: string) => {
		const lines = str.split("\n");
		if (lines.length > 1) {
			line += lines.length - 1;
			column = lines[lines.length - 1].length + 1;
		} else {
			column += str.length;
		}
		cursor += str.length;
	};

	const getLoc = (start: Position): SourceLocation => ({
		start,
		end: createPosition(line, column, cursor),
	});

	while (cursor < template.length) {
		const parent = stack[stack.length - 1];
		if (!parent) break;

		const startPos = createPosition(line, column, cursor);
		const remaining = template.substring(cursor);

		// Encontrar próximo token
		const nextDirective = remaining.indexOf(EJB_DEFAULT_PREFIX_DIRECTIVE);
		const nextInterpolation = remaining.indexOf(interpStart);
		const nextEscaped = remaining.indexOf(EJB_ESCAPED_PREFIX_DIRECTIVE);

		// Encontrar regex match mais próximo
		let earliestRegexMatch = null;
		for (const directive of regexDirectives) {
			const match = remaining.match(directive.name as RegExp);
			if (
				match?.index !== undefined &&
				(!earliestRegexMatch || match.index < earliestRegexMatch.index)
			) {
				earliestRegexMatch = {
					index: match.index,
					length: match[0].length,
					directive,
					match,
				};
			}
		}

		const tokenPositions = [
			nextDirective !== -1 && nextDirective,
			nextInterpolation !== -1 && nextInterpolation,
			earliestRegexMatch?.index,
			nextEscaped !== -1 && nextEscaped,
		].filter((pos) => pos !== false && pos !== undefined) as number[];

		const nextTokenPos = tokenPositions.length
			? Math.min(...tokenPositions)
			: Infinity;

		// Processar texto antes do token
		if (nextTokenPos > 0) {
			const textContent = remaining.substring(0, nextTokenPos);
			parent.children.push({
				type: EjbAst.Text,
				value: textContent,
				loc: getLoc(startPos),
			});
			advance(textContent);
			continue;
		}

		// Fim do template
		if (nextTokenPos === Infinity) {
			if (remaining.length > 0) {
				parent.children.push({
					type: EjbAst.Text,
					value: remaining,
					loc: getLoc(startPos),
				});
				advance(remaining);
			}
			break;
		}

		const tokenStartPos = createPosition(line, column, cursor);

		// Diretiva escapada (@@)
		if (nextTokenPos === nextEscaped) {
			advance(EJB_ESCAPED_PREFIX_DIRECTIVE);
			const match = template.substring(cursor).match(DIRECTIVE_REGEX);
			if (match) {
				parent.children.push({
					type: EjbAst.Text,
					value: EJB_ESCAPED_PREFIX_DIRECTIVE + match[0],
					loc: getLoc(tokenStartPos),
				});
				advance(match[0]);
			} else {
				parent.children.push({
					type: EjbAst.Text,
					value: EJB_ESCAPED_PREFIX_DIRECTIVE,
					loc: getLoc(tokenStartPos),
				});
			}
			continue;
		}

		// Regex directive
		if (earliestRegexMatch && nextTokenPos === earliestRegexMatch.index) {
			const { directive, match } = earliestRegexMatch;
			const directiveNode: DirectiveNode = {
				type: EjbAst.Directive,
				name: directive.name.toString(),
				expression: match[0],
				children: [],
				auto_closed: false,
				loc: getLoc(tokenStartPos),
			};
			parent.children.push(directiveNode);
			advance(match[0]);
			if (directive.children) stack.push(directiveNode);
			continue;
		}

		// Interpolação
		if (nextTokenPos === nextInterpolation) {
			advance(interpStart);
			const expressionEnd = template.indexOf(interpEnd, cursor);
			if (expressionEnd === -1) {
				const err: EjbError = new Error("Unclosed interpolation expression");
				err.loc = getLoc(tokenStartPos);
				root.errors.push(err);
				break;
			}
			const expression = template.substring(cursor, expressionEnd).trim();
			parent.children.push({
				type: EjbAst.Interpolation,
				expression,
				escaped: true,
				loc: getLoc(tokenStartPos),
			});
			advance(template.substring(cursor, expressionEnd + interpEnd.length));
			continue;
		}

		// Diretiva normal
		if (nextTokenPos === nextDirective) {
			advance(EJB_DEFAULT_PREFIX_DIRECTIVE);
			const match = template.substring(cursor).match(DIRECTIVE_REGEX);
			if (!match) {
				const err: EjbError = new Error("Invalid directive");
				err.loc = getLoc(tokenStartPos);
				root.errors.push(err);
				continue;
			}

			const [matchedStr, name, expr = ""] = match;
			const expression = expr.trim();

			// Verificar se é sub-diretiva
			let parentDirective = null;
			let isSubDirective = false;

			for (let i = stack.length - 1; i >= 0; i--) {
				const node = stack[i];
				if (
					node.type === EjbAst.Directive ||
					node.type === EjbAst.SubDirective
				) {
					const directiveDef = ejb.directives[node.name];
					if (directiveDef?.parents?.some((p: any) => p.name === name)) {
						parentDirective = node;
						isSubDirective = true;
						break;
					}
				}
			}

			// Verificar se é fechamento (apenas para diretivas principais, não sub-diretivas)
			let isClosingDirective = false;
			if (!isSubDirective) {
				// Verificar se é um @end genérico
				if (name === "end") {
					isClosingDirective = true;
				} else {
					// Verificar se está fechando uma diretiva principal na stack
					for (let i = stack.length - 1; i > 0; i--) {
						const node = stack[i];
						if (
							node.type !== EjbAst.Root &&
							(node as DirectiveNode | SubDirectiveNode).name === name
						) {
							isClosingDirective = true;
							break;
						}
					}
				}
			}

			// Processar fechamento de diretiva
			if (isClosingDirective) {
				advance(matchedStr);

				if (stack.length === 1) {
					const err: EjbError = new Error(
						`Unexpected ${EJB_DEFAULT_PREFIX_DIRECTIVE}${name} directive`,
					);
					err.loc = getLoc(tokenStartPos);
					root.errors.push(err);
					continue;
				}

				if (name === "end") {
					// @end fecha a diretiva atual
					const closedNode = stack.pop();
					if (closedNode?.loc) closedNode.loc.end = getLoc(tokenStartPos).end;
				} else {
					// Fechar até a diretiva correspondente
					const targetIndex = stack.findLastIndex(
						(node, index) =>
							index > 0 &&
							node.type !== EjbAst.Root &&
							(node as any).name === name,
					);

					if (targetIndex === -1) {
						const err: EjbError = new Error(
							`No matching ${EJB_DEFAULT_PREFIX_DIRECTIVE}${name} directive to close`,
						);
						err.loc = getLoc(tokenStartPos);
						root.errors.push(err);
						continue;
					}

					// Atualizar loc.end para todos os nodes que serão fechados
					for (let i = stack.length - 1; i >= targetIndex; i--) {
						const node = stack[i];
						if (node?.loc) node.loc.end = getLoc(tokenStartPos).end;
					}
					stack.length = targetIndex;
				}
				continue;
			}

			// Criar nova diretiva
			const directiveDef = isSubDirective
				? ejb.directives[parentDirective?.name as string]?.parents?.find(
						(p: any) => p.name === name,
					)
				: ejb.directives[name];

			const directiveLoc = getLoc(tokenStartPos);
			(directiveLoc.end as any) = createPosition(
				line,
				column + matchedStr.length,
				cursor + matchedStr.length,
			);

			const directiveNode: DirectiveNode | SubDirectiveNode = isSubDirective
				? {
						type: EjbAst.SubDirective,
						name,
						expression,
						children: [],
						auto_closed: false,
						parent_name: parentDirective?.name as string,
						loc: directiveLoc,
					}
				: {
						type: EjbAst.Directive,
						name,
						expression,
						children: [],
						auto_closed: false,
						loc: directiveLoc,
					};

			advance(matchedStr);

			// Adicionar ao parent correto
			if (isSubDirective && parentDirective) {
				parentDirective.children.push(directiveNode);

				// CORREÇÃO: Não fechar sub-diretivas anteriores automaticamente
				// Sub-diretivas como @case, @default devem coexistir, não se fecharem
			} else {
				parent.children.push(directiveNode);
			}

			// Empilhar se necessário
			const shouldPush =
				directiveDef &&
				(isSubDirective ||
					directiveDef.children === true ||
					"internal" in directiveDef);

			if (shouldPush) {
				stack.push(directiveNode);
			}
		}
	}

	// Fechar nodes abertos
	while (stack.length > 1) {
		const node = stack.pop() as DirectiveNode | SubDirectiveNode;
		node.auto_closed = true;
		if (node.loc) node.loc.end = createPosition(line, column, cursor);
	}

	if (root.loc) root.loc.end = createPosition(line, column, cursor);
	return root;
}
