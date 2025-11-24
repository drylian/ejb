import type { EjbParamOption, Expression } from "./types";

function parseExpressionArgs(expression: string): string[] {
	const args: string[] = [];
	let level = 0,
		start = 0;
	let inString: false | "'" | '"' | "`" = false;

	for (let i = 0; i < expression.length; i++) {
		const char = expression[i];

		if (inString) {
			if (char === inString && expression[i - 1] !== "\\") inString = false;
			continue;
		}

		switch (char) {
			case "`":
			case "'":
			case '"':
				inString = char;
				break;
			case "(":
			case "[":
			case "{":
				level++;
				break;
			case ")":
			case "]":
			case "}":
				level--;
				break;
			case ",":
				if (level === 0) {
					const arg = expression.substring(start, i).trim();
					if (arg) args.push(arg);
					start = i + 1;
				}
				break;
		}
	}

	const lastArg = expression.substring(start).trim();
	if (lastArg) args.push(lastArg);
	return args;
}

function safeEval<T>(value: string): T | undefined {
	try {
		return new Function(`return ${value}`)() as T;
	} catch {
		return undefined;
	}
}

export function createExpression(
	expression: string,
	params: EjbParamOption[],
): Expression {
	const argStrings = parseExpressionArgs(expression);
	const paramMap = new Map(params.map((p) => [p.name, p]));

	const getArg = (name: string) => {
		const index = params.findIndex((p) => p.name === name);
		return index >= 0 ? argStrings[index] : undefined;
	};

	const getArgWithDefault = (name: string) => {
		const arg = getArg(name);
		if (arg !== undefined) return arg;
		return paramMap.get(name)?.default;
	};

	const baseGet = (name: string) => ({
		raw: getArg(name),
		string: getArgWithDefault(name)?.replace(/^["'`]|["'`]$/g, ""),
		number: () => {
			const val = getArgWithDefault(name);
			return val !== undefined ? parseFloat(val) : undefined;
		},
		boolean: () => {
			const val = getArgWithDefault(name);
			return val !== undefined ? val === "true" : undefined;
		},
		object: <T>() => safeEval<T>(getArgWithDefault(name) || ""),
		array: <T>() => safeEval<T[]>(getArgWithDefault(name) || ""),
	});

	return {
		raw: expression,
		getRaw: (name: string) => baseGet(name).raw,
		getString: (name: string) => baseGet(name).string,
		getNumber: (name: string) => baseGet(name).number(),
		getBoolean: (name: string) => baseGet(name).boolean(),
		getObject: <T>(name: string) => baseGet(name).object<T>(),
		getArray: <T = any>(name: string) => baseGet(name).array<T>(),
	};
}
