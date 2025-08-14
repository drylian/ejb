import { Ejb, EJBNodeJSResolver } from "../src";
import { test, expect } from "bun:test";

const ejb = new Ejb({
    async:true,
    resolver:EJBNodeJSResolver('./tests/views', true)
});

test("EJB Test View with @css and @head directives", async () => {
    const result = await ejb.render('./ejb.test.ejb');

    // Assertions
    expect(result).toContain('<meta charset="utf-8">');
    expect(result).toContain('<title>EJB Test View</title>');
    expect(result).toContain(`body {
            font-family: sans-serif;
            background-color: #f0f0f0;
        }`);
    expect(result).toContain(`h1 {
            color: navy;
        }`);
    expect(result).not.toContain('<!--$ejb-head-replace-->');
});