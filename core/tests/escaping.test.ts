import { expect, test, describe } from "bun:test";
import { Kire } from "../src/index";

describe("Kire - Escaping & Raw Interpolation", () => {
    test("Standard interpolation {{ }} should escape HTML", async () => {
        const kire = new Kire();
        const template = "Hello {{ name }}";
        const result = await kire.render(template, { name: "<b>World</b>" });
        expect(result).toBe("Hello &lt;b&gt;World&lt;/b&gt;");
    });

    test("Raw interpolation {{{ }}} should NOT escape HTML", async () => {
        const kire = new Kire();
        const template = "Hello {{{ name }}}";
        const result = await kire.render(template, { name: "<b>World</b>" });
        expect(result).toBe("Hello <b>World</b>");
    });

    test("Mixed interpolation types", async () => {
        const kire = new Kire();
        const template = "Escaped: {{ val }}, Raw: {{{ val }}}";
        const result = await kire.render(template, { val: "<i>Italic</i>" });
        expect(result).toBe("Escaped: &lt;i&gt;Italic&lt;/i&gt;, Raw: <i>Italic</i>");
    });

    test("Null and undefined should render as empty string", async () => {
        const kire = new Kire();
        const template = "Null: {{ n }}, Undefined: {{ u }}";
        const result = await kire.render(template, { n: null, u: undefined });
        expect(result).toBe("Null: , Undefined: ");
    });
});
