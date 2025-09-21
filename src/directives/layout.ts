import { ejbDirective } from "../constants";
import { trimQuotes } from "../utils";

export default Object.assign(
	{},
	/**
	 * @stack directive
	 */
	ejbDirective({
		name: "stack",
		priority: 1,
		onInitFile: () => `$ejb._stacks = {};\n
        $ejb.stacks = new Proxy({}, {
            get(target, prop) {
                if(!$ejb._stacks[prop]) $ejb._stacks[prop] = [];
                if (!(prop in target)) {
                    target[prop] = {
                        add(item) {
                            $ejb._stacks[prop].push(item);
                            return this;
                        },
                        join(separator = ",") {
                            return $ejb._stacks[prop].join(separator);
                        }
                    };
                }
                return target[prop];
            }
        });
`,
		onParams(_, exp) {
			return `$ejb.res = $ejb._stacks[${exp}] ? ($ejb.res + $ejb.stacks[${exp}].join('\\n')) : ($ejb.res + '<!-- EJB:stack(${trimQuotes(exp)}) -->');`;
		},
		onEndFile: () => {
			return `
                Object.keys($ejb.stacks).forEach(pushname => {
                    $ejb.res = $ejb.res.split(\`<!-- EJB:stack(\${pushname}) -->\`).join($ejb.stacks[pushname].join('\\n'));
                });
    
                // remove not used stacks
                $ejb.res = $ejb.res.replace(/<!-- EJB:stack\\(.*?\\) -->/g, '');`;
		},
	}),
	/**
	 * @push directive
	 */
	ejbDirective({
		name: "push",
		priority: 1,
		children: true,
		// onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
		// onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
		onInit: (ejb, exp) =>
			`$ejb.stacks[${exp}].add(${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`,
		onEnd: () => ";return $ejb.res;})({ ...$ejb, res:'' }));",
	}),
	/**
	 * @defined directive
	 */
	ejbDirective({
		name: "defined",
		priority: 11,
		onInitFile: () => `$ejb.defines = {};`,
		onParams(_, exp) {
			return `$ejb.res = $ejb.defines[${exp}] ? ($ejb.res + $ejb.defines[${exp}]) : ($ejb.res + '<!-- EJB:defines(${trimQuotes(exp)}) -->');`;
		},
		onEndFile: () => {
			return `
                Object.keys($ejb.defines).forEach(pushname => {
                    $ejb.res = $ejb.res.split(\`<!-- EJB:defines(\${pushname}) -->\`).join($ejb.defines[pushname]);
                });
    
                // remove not used defines
                $ejb.res = $ejb.res.replace(/<!-- EJB:defines\\(.*?\\) -->/g, '');`;
		},
	}),
	/**
	 * @define directive
	 */
	ejbDirective({
		name: "define",
		priority: 11,
		children: true,
		// onInit + onEnd + async = $ejb.res += await(async ($ejb) => { ...content })({ ...$ejb, res: ''});
		// onInit + onEnd + sync = $ejb.res += (($ejb) => { ...content })({ ...$ejb, res: ''});
		onInit: (ejb, exp) =>
			`$ejb.defines[${exp}] = ${ejb.async ? "await" : ""} (${ejb.async ? "async" : ""} ($ejb) => {`,
		onEnd: () => ";return $ejb.res;})({ ...$ejb, res:'' });",
	}),
);
