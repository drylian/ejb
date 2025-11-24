import { ejbDirective } from "../constants";
import type { EjbBuilder } from "../builder";

/**
 * SSR-specific directives
 */
export default Object.assign(
	{},
	/**
	 * @client directive - Code that runs only on client side
	 */
	ejbDirective({
		name: "client",
		priority: 1,
		children: true,
		description: "Defines code that should only run on the client side",
		example: "@client const handler = () => console.log('clicked'); @end",
		children_type: "js",
		onChildren: async (ejb, { children }) => {
			if ("res" in ejb && typeof ejb.res === "function") {
				const builder = ejb as unknown as EjbBuilder;
				const content = await builder.compile(children, true);
				builder.res(content, "client");
				return "";
			}
			return await ejb.compile(children, true);
		},
	}),

	/**
	 * @server directive - Code that runs only on server side
	 */
	ejbDirective({
		name: "server",
		priority: 1,
		children: true,
		description: "Defines code that should only run on the server side",
		example: "@server const data = await fetchFromDB(); @end",
		children_type: "js",
		onChildren: async (ejb, { children }) => {
			if ("res" in ejb && typeof ejb.res === "function") {
				const builder = ejb as unknown as EjbBuilder;
				const content = await builder.compile(children, true);
				builder.res(content, "server");
				return "";
			}
			return await ejb.compile(children, true);
		},
	}),

	/**
	 * @style directive - CSS styles
	 */
	ejbDirective({
		name: "style",
		priority: 1,
		children: true,
		description: "Defines CSS styles for the component",
		example: "@style .button { background: blue; } @end",
		children_type: "css",
		onChildren: async (ejb, { children }) => {
			if ("res" in ejb && typeof ejb.res === "function") {
				const builder = ejb as unknown as EjbBuilder;
				const content = await builder.compile(children, true);
				builder.res(content, "css");
				return "";
			}
			return "";
		},
	}),

	/**
	 * @hydrate directive - Marks content for client-side hydration
	 */
	ejbDirective({
		name: "hydrate",
		priority: 1,
		children: true,
		description: "Marks content for client-side hydration",
		example: "@hydrate <button onclick='handleClick()'>Click</button> @end",
		onInit: (ejb) => {
			if ("res" in ejb && typeof ejb.res === "function") {
				const builder = ejb as unknown as EjbBuilder;
				const id = `hydrate-${Math.random().toString(36).substring(7)}`;
				builder.res(`$ejb.res += '<div data-hydrate="${id}">';`, "server");
				builder.res(
					`document.querySelector('[data-hydrate="${id}"]').innerHTML = `,
					"client",
				);
				return "";
			}
			return "$ejb.res += '<div>';";
		},
		onEnd: (ejb) => {
			if ("res" in ejb && typeof ejb.res === "function") {
				const builder = ejb as unknown as EjbBuilder;
				builder.res("$ejb.res += '</div>';", "server");
				builder.res(";", "client");
				return "";
			}
			return "$ejb.res += '</div>';";
		},
	}),

	/**
	 * @asset directive - Includes client assets
	 */
	ejbDirective({
		name: "asset",
		priority: 1,
		description: "Includes client-side assets (JS/CSS)",
		example: "@asset('script', 'main')",
		params: [
			{ name: "type", type: "string", required: true },
			{ name: "name", type: "string", required: true },
		],
		onParams: async (ejb, exp) => {
			if ("getAssets" in ejb) {
				const builder = ejb as unknown as EjbBuilder;
				const type = exp.getString("type");
				const name = exp.getString("name");
				const current = builder.current;

				if (!current) {
					throw new Error("[EJB] No current file set for @asset");
				}

				const assets = await builder.getAssets(current);
				const asset = assets.find((a) => {
					if (type === "script") return a.startsWith("cl-") && a.endsWith(".js");
					if (type === "style") return a.startsWith("st-") && a.endsWith(".css");
					return false;
				});

				if (asset) {
					const tag =
						type === "script"
							? `<script src="/${asset}"></script>`
							: `<link rel="stylesheet" href="/${asset}">`;
					return `$ejb.res += \`${tag}\`;`;
				}
			}
			return "";
		},
	}),
);
