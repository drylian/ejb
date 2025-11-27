
import { Kire } from "kire";
import { expect, test, describe } from "bun:test";

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
            name: 'foo',
            onCall: (ctx) => ctx.res('$ctx.res("bar")')
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
