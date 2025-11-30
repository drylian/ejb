import { describe, expect, test } from "bun:test";
import { Kire } from "kire";

const kire = new Kire();

describe("Escaped Directives", () => {
	test("should render @@directive as @directive", async () => {
		const tpl = "This is a @@directive";
		const res = await kire.render(tpl);
		expect(res).toBe("This is a @directive");
	});

	test("should render @@@directive as @@directive", async () => {
		const tpl = "This is a @@@directive";
		const res = await kire.render(tpl);
		expect(res).toBe("This is a @@directive");
	});

	test("should render valid directive normally", async () => {
		kire.directive({
			name: "foo",
			onCall: (ctx) => ctx.raw('$ctx.res("bar")'),
		});
		const tpl = "@foo";
		const res = await kire.render(tpl);
		expect(res).toBe("bar");
	});

	test("should render mixed escaped and valid directives", async () => {
		const tpl = "@@foo @foo";
		const res = await kire.render(tpl);
		expect(res).toBe("@foo bar");
	});
});
