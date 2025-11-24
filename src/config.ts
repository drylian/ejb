import type { EjbDirectivePlugin } from "./types";

interface MakeConfigOptions {
	packageName: string;
	version: string;
	url?: string;
	$schema?: string;
}

export function makeConfig(
	directives: Record<string, EjbDirectivePlugin>,
	options: MakeConfigOptions,
) {
	const configDirectives = Object.values(directives)
		.map((dir) => {
			if (typeof dir.name === "object") {
				// Cannot represent RegExp as JSON, skipping
				return null;
			}
			return {
				name: dir.name,
				description: dir.description || "",
				children: dir.children || false,
				example: dir.example ?? "Example not defined",
				children_type: dir.children_type || "html",
				params: dir.params,
				// params can be defined in the future for more detailed intellisense
				parents: dir.parents?.map((p) => ({
					name: p.name,
					params: p.params,
					example: p.example ?? "Example not defined",
					children_type: dir.children_type || "html",
					description: (p as any).description || "",
				})),
			};
		})
		.filter(Boolean);

	return {
		$schema:
			options.$schema ??
			"https://raw.githubusercontent.com/drylian/ejb/main/vs-code/schemas/ejbconfig.schema.json",
		package: options.packageName,
		version: options.version,
		url: options.url || "",
		directives: configDirectives,
	};
}
