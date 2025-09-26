import type { EjbParamOption, Expression } from "./types";

function parseExpressionArgs(expression: string): string[] {
    const args: string[] = [];
    let level = 0;
    let start = 0;
    let inString: false | "'" | '"' | "`" = false;

    for (let i = 0; i < expression.length; i++) {
        const char = expression[i];

        if (inString) {
            if (char === inString && expression[i - 1] !== '\\') {
                inString = false;
            }
            continue;
        }

        switch (char) {
            case '`':
            case "'":
            case '"':
                inString = char;
                break;
            case '(': 
            case '[':
            case '{':
                level++;
                break;
            case ')':
            case ']':
            case '}':
                level--;
                break;
            case ',':
                if (level === 0) {
                    args.push(expression.substring(start, i).trim());
                    start = i + 1;
                }
                break;
        }
    }

    args.push(expression.substring(start).trim());
    return args.filter(arg => arg);
}

export function createExpression(expression: string, params: EjbParamOption[]): Expression {
    const argStrings = parseExpressionArgs(expression);
    const getArg = (name: string): string | undefined => {
        const index = params.findIndex(p => p.name === name);
        if (index === -1) return undefined;
        return argStrings[index];
    }

    const getArgWithDefault = (name: string): string | undefined => {
        const arg = getArg(name);
        if (arg !== undefined) return arg;
        const param = params.find(p => p.name === name);
        return param?.default;
    }

    return {
        raw: expression,
        getRaw: (name: string) => getArg(name),
        getString: (name: string) => {
            const val = getArgWithDefault(name);
            return val?.replace(/^["\'\`]|["\'\`]$/g, '');
        },
        getNumber: (name: string) => {
            const val = getArgWithDefault(name);
            return val !== undefined ? parseFloat(val) : undefined;
        },
        getBoolean: (name: string) => {
            const val = getArgWithDefault(name);
            return val !== undefined ? val === 'true' : undefined;
        },
        getObject: <T>(name: string): T | undefined => {
            const val = getArgWithDefault(name);
            if (val === undefined) return undefined;
            try {
                // Using new Function to safely parse object literals
                return new Function(`return ${val}`)() as T;
            } catch (e) {
                console.error(`[EJB] Failed to parse object for param '${name}':`, e);
                return undefined as any;
            }
        },
        getArray: <T extends any = any>(name: string): T[] | undefined => {
            const val = getArgWithDefault(name);
            if (val === undefined) return undefined;
            try {
                // Using new Function to safely parse array literals
                return new Function(`return ${val}`)() as T[];
            } catch (e) {
                console.error(`[EJB] Failed to parse array for param '${name}':`, e);
                return undefined;
            }
        },
    }
}
