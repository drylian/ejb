declare module "kire" {
	interface Kire {
		/**
		 * Renders a template from a file path.
		 * This is an alias for the `render` method.
		 * @param filepath The path to the template file.
		 * @param locals The local variables to pass to the template.
		 */
		view(filepath: string, locals?: Record<string, any>): Promise<string>;
	}
}
