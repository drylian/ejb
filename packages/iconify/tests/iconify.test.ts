import { describe, expect, it, mock } from "bun:test";
import { KireIconify } from "../src/index";
import { Kire } from "kire";

describe("KireIconify", () => {
    it("should fetch and render icon with class injection", async () => {
        const kire = new Kire({
            plugins: [KireIconify]
        });

        // Mock global fetch
        global.fetch = mock(async (url: string) => {
            if (url.includes('mdi/home.svg')) {
                return {
                    ok: true,
                    text: async () => '<svg viewBox="0 0 24 24"><path d="..."/></svg>'
                };
            }
            return { ok: false };
        });

        const template = `<iconify i="mdi:home" class="text-red-500" />`;
        const result = await kire.render(template);

        expect(result).toContain('<svg class="text-red-500" viewBox="0 0 24 24">');
        expect(global.fetch).toHaveBeenCalled();
    });

    it("should handle fetch errors gracefully", async () => {
        const kire = new Kire({ plugins: [KireIconify] });
        
        global.fetch = mock(async () => ({ ok: false }));

        const result = await kire.render(`<iconify i="bad:icon" />`);
        expect(result).toContain('<!-- Icon not found: bad:icon -->');
    });
});
