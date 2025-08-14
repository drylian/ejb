import { Ejb, EJBNodeJSResolver } from "../src";
import { test, expect } from "bun:test";

const ejb = new Ejb({
    async:true,
    resolver:EJBNodeJSResolver('./tests/views', true)
});
const result = await ejb.render('./ejb.test.ejb');
console.log(result)