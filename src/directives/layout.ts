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
		onInitFile: (ejb) => {
			ejb.builder.add(`$ejb._stacks = {};\n
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
`);
		},
		onParams(ejb, exp) {
			ejb.builder.add(
				`$ejb.res += $ejb._stacks[${exp.raw}]?.length ? $ejb.stacks[${exp.raw}].join('\\n') : '<!-- EJB:stack(${trimQuotes(exp.raw)}) -->';`,
			);
		},
		onEndFile: (ejb) => {
			ejb.builder.add(`
                Object.keys($ejb.stacks).forEach(pushname => {
                    $ejb.res = $ejb.res.split(\`<!-- EJB:stack(\${pushname}) -->\`).join($ejb.stacks[pushname].join('\\n'));
                });
    
                // remove not used stacks
                $ejb.res = $ejb.res.replace(/<!-- EJB:stack\\(.*?\\) -->/g, '');`);
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
		onInit: (ejb, exp) => {
			ejb.builder.add(`$ejb.stacks[${exp.raw}].add(await (async ($ejb) => {`);
		},
		onEnd: (ejb) => {
			ejb.builder.add(";return $ejb.res;})({ ...$ejb, res:'' }));");
		},
	}),
	/**
	 * @defined directive
	 */
	ejbDirective({
		name: "defined",
		priority: 11,
		onInitFile: (ejb) => {
			ejb.builder.add(`$ejb.defines = {};`);
		},
		onParams(ejb, exp) {
			ejb.builder.add(
				`$ejb.res += $ejb.defines[${exp.raw}] ? $ejb.defines[${exp.raw}] : '<!-- EJB:defines(${trimQuotes(exp.raw)}) -->';`,
			);
		},
		onEndFile: (ejb) => {
			ejb.builder.add(`
                Object.keys($ejb.defines).forEach(pushname => {
                    $ejb.res = $ejb.res.split(\`<!-- EJB:defines(\${pushname}) -->\`).join($ejb.defines[pushname]);
                });
    
                // remove not used defines
                $ejb.res = $ejb.res.replace(/<!-- EJB:defines\\(.*?\\) -->/g, '');`);
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
		onInit: (ejb, exp) => {
			ejb.builder.add(`$ejb.defines[${exp.raw}] = await (async ($ejb) => {`);
		},
		onEnd: (ejb) => {
			ejb.builder.add(";return $ejb.res;})({ ...$ejb, res:'' });");
		},
	}),
);
