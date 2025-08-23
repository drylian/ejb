/**
 * Type guard for Promise objects. Checks if a value is "thenable".
 * @template T - The type of the value the Promise will resolve to.
 * @param p - The value to check.
 * @returns {boolean} - True if the value is a Promise, otherwise false.
 */
export function isPromise<T>(p: any): p is Promise<T> {
	return p !== null && typeof p === "object" && typeof p.then === "function";
}

/**
 * Resolves a potentially promised value and applies a sequence of transformer functions.
 * This is useful for chaining operations where any step might be asynchronous.
 * @template Input - The type of the initial data.
 * @template Output - The final output type after all transformations.
 * @param data - The initial data, which can be a direct value or a Promise.
 * @param transformers - An array of functions to apply in sequence to the data.
 * @returns {Output | Promise<Output>} - The final transformed value, wrapped in a Promise if any step was async.
 */
export function PromiseResolver<Input, Output = Input>(
	data: Input | Promise<Input>,
	...transformers: Array<(value: any) => any>
): Output | Promise<Output> {
	// Inner recursive function to apply transformers one by one.
	const apply = (value: any, index = 0): any => {
		// If all transformers have been applied, return the final value.
		if (index >= transformers.length) return value;

		// Apply the current transformer.
		const transformed = transformers[index](value);

		// If the result is a promise, wait for it to resolve before applying the next transformer.
		// Otherwise, apply the next transformer immediately.
		return isPromise(transformed)
			? transformed.then((v) => apply(v, index + 1))
			: apply(transformed, index + 1);
	};

	// If the initial data is a promise, wait for it to resolve first, then start the chain.
	// Otherwise, start the chain immediately with the direct value.
	return isPromise(data) ? data.then((v) => apply(v)) : apply(data);
}
