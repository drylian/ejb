import { Ejb } from "../src";
import { EJBBunResolver } from "../src/resolvers";

const ejb = new Ejb({
    async:true,
    root:'tests/views',
    resolver:EJBBunResolver
})
Bun.serve({
	routes: {
		"/*": async () => {
			return new Response(await ejb.render('./main.ejb'));
		},
	},
    port:3000
});
