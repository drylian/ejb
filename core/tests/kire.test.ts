import { expect, test } from "bun:test";
import { Kire } from "../src/index";

test("Kire - Basic Interpolation", async () => {
	const kire = new Kire();
	const result = await kire.render("Hello {{ name }}!", { name: "World" });
	expect(result).toBe("Hello World!");
});

test("Kire - Simple Directive", async () => {
	const kire = new Kire();

	kire.directive({
		name: "hello",
		onCall(ctx) {
			ctx.raw('$ctx.res("Hello Directive");');
		},
	});

	const result = await kire.render("@hello()");
	expect(result).toBe("Hello Directive");
});

test("Kire - Directive with Param", async () => {
	const kire = new Kire();

	kire.directive({
		name: "echo",
		params: ["msg:string"],
		onCall(ctx) {
			const msg = ctx.param("msg"); // Should be 'Test Message'
			ctx.raw(`$ctx.res(${JSON.stringify(msg)});`); // Embed as a string literal
		},
	});

	// Parser will pass 'Test Message' as the param value (string without quotes)
	const result = await kire.render("@echo('Test Message')");
	expect(result).toBe("Test Message");
});

test("Kire - Pre/Pos Buffers", async () => {
	const kire = new Kire();

	kire.directive({
		name: "wrap",
		onCall(ctx) {
			ctx.pre('const prefix = "START";');
			ctx.raw("$ctx.res(prefix);");
			ctx.raw('$ctx.res("CONTENT");');
			ctx.pos("// End of script");
		},
	});

	const result = await kire.render("@wrap()");
	expect(result).toBe("STARTCONTENT");
});

test("Kire - Nested Directives (If/ElseIf/Else)", async () => {

	const kire = new Kire();

	const tpl1 = "@if(true)A@elseB@end";
	const result1 = await kire.render(tpl1);
	expect(result1).toBe("A");
	const tpl2 = "@if(false)A@elseB@end";
	const result2 = await kire.render(tpl2);
	expect(result2).toBe("B");

	const tpl3 = "@if(false)A@elseif(true)C@elseB@end";
	const result3 = await kire.render(tpl3);
	expect(result3).toBe("C");
});
