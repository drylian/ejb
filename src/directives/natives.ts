import { ejbDirective } from "../constants";
import { md5, PromiseResolver } from "../utils";

export default Object.assign(
	{},
	/**
	 * @code
	 */
	ejbDirective({
		name: "code",
		priority: 1,
		children: true,
		children_type: 'js',
        description: 'Executes raw JavaScript code on the server side.',
        example: `
@code
    const myVar = "Hello, EJB!";
    $ejb.res += myVar;
@end`,
		onChildren: (ejb, { children }) => {
			return ejb.compileNode(children, true);
		},
	}),
	/**
	 * @if Allow to if directive
	 */
	ejbDirective({
		name: "if",
		priority: 1,
		children: true,
        description: 'Conditionally renders a block of code.',
        example: '@if(user.isLoggedIn)\n    <p>Welcome, {user.name}</p>\n@end',
		onParams: (_, expression) => {
			return `if (${expression}) {`;
		},
        onEnd: () => "}",
		parents: [
			{
				name: "elseif",
                internal:true,
                description: 'An alternative condition for an @if block.',
				onInit: (_, e) => `} else if (${e}) {`,
                onEnd: () => "}",
			},
			{
				name: "else",
                internal:true,
                description: 'The default case for an @if block.',
				onInit: () => `else {`,
			},
		],
	}),
	/**
	 * @for directive
	 */
	ejbDirective({
		name: "for",
		priority: 1,
		children: true,
        description: 'Repeats a block of code for each item in an array.',
        example: '@for(const user of users)\n    <p>{user.name}</p>\n@end',
		onInit: (_, expression) => {
			return `for (${expression}) {`;
		},
		onEnd: () => {
			return `}`;
		},
	}),
	/**
	 * @isset directive
	 */
	ejbDirective({
		name: "isset",
		priority: 1,
        description: 'Checks if a variable is defined and not null, then prints it.',
        example: '@isset(myVar)',
		onParams(_, expression) {
			return `if(typeof ${expression} !== "undefined" && ${expression}) $ejb.res += ${expression};`;
		},
	}),
	/**
	 * @switch directive
	 */
	ejbDirective({
		name: "switch",
		priority: 1,
		children: true,
        description: 'A control structure that allows checking a variable against multiple values.',
        example: '@switch(role)\n    @case("admin")\n        <p>Admin panel</p>\n    @default\n        <p>User panel</p>\n@end',
		onParams: (_, expression) => {
			return `switch (${expression}) {`;
		},
		parents: [
			{
				name: "case",
				internal: true,
                description: 'A case within a @switch block.',
				onInit: (_, expression) => `case ${expression}: {`,
				onEnd: () => ";break;}",
			},
			{
				name: "default",
				internal: true,
                description: 'The default case for a @switch block.',
				onInit: () => `default: {`,
				onEnd: () => "}",
			},
		],
		onChildren: (_, { parents }) => PromiseResolver(_.compileNode(parents)),
		onEnd: () => "}",
	}),
	/**
	 * @once directive
	 */
	ejbDirective({
		name: "once",
		priority: 1,
		children: true,
        description: 'Ensures a block of code is rendered only once, even if included multiple times.',
        example: '@once\n    <script src="..." />\n@end',
		onInitFile: () => "$ejb.onces = {};",
		onChildren: (ejb, opts) => {
			return PromiseResolver(
				ejb.compileNode(opts.children),
				(content: string) => {
					const reference = md5(content);
					return `if(typeof $ejb.onces['${reference}'] == "undefined") {
                $ejb.onces['${reference}'] = true;
                ${content}
                `;
				},
			);
		},
		onEnd: () => "};",
	}),
);

