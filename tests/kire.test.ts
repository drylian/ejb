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
        name: 'hello',
        onCall(ctx) {
            ctx.res('$ctx.res("Hello Directive");');
        }
    });
    
    const result = await kire.render("@hello()");
    expect(result).toBe("Hello Directive");
});

test("Kire - Directive with Param", async () => {
    const kire = new Kire();
    
    kire.directive({
        name: 'echo',
        params: ['msg:string'],
        onCall(ctx) {
            const msg = ctx.param('msg'); // Should be 'Test Message'
            ctx.res(`$ctx.res(${JSON.stringify(msg)});`); // Embed as a string literal
        }
    });
    
    // Parser will pass 'Test Message' as the param value (string without quotes)
    const result = await kire.render("@echo('Test Message')");
    expect(result).toBe("Test Message");
});

test("Kire - Pre/Pos Buffers", async () => {
    const kire = new Kire();
    
    kire.directive({
        name: 'wrap',
        onCall(ctx) {
            ctx.pre('const prefix = "START";');
            ctx.res('$ctx.res(prefix);');
            ctx.res('$ctx.res("CONTENT");');
            ctx.pos('// End of script');
        }
    });
    
    const result = await kire.render("@wrap()");
    expect(result).toBe("STARTCONTENT");
});

test("Kire - Nested Directives (If/ElseIf/Else)", async () => {
    const kire = new Kire();
    
    kire.directive({
        name: 'if',
        params: ['cond:string'],
        children: true, // allow @end interaction
        parents: [
            {
                name: 'elseif',
                params: ['cond:string'],
                children: true,
                onCall (ctx) {
                    ctx.res(`} else if (${ctx.param('cond')}) {`);
                    ctx.set(ctx.children ?? []);
                }
            },
            {
                name: 'else',
                children: true,
                onCall (ctx) {
                    ctx.res(`} else {`);
                    if (ctx.children) ctx.set(ctx.children);
                }
            }
        ],
        onCall(ctx) {
            const cond = ctx.param('cond');
            ctx.res(`if (${cond}) {`);
            if (ctx.children) ctx.set(ctx.children);
            if (ctx.parents) ctx.set(ctx.parents);
            ctx.res('}');
        }
    });

    const tpl1 = "@if(true)A@else B@end";
    const result1 = await kire.render(tpl1);
    expect(result1).toBe("A");

    const tpl2 = "@if(false)A@else B@end";
    const result2 = await kire.render(tpl2);
    expect(result2).toBe(" B");
    
    const tpl3 = "@if(false)A@elseif(true)C@else B@end";
    const result3 = await kire.render(tpl3);
    expect(result3).toBe("C");
});
