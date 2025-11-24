/**
 * Exemplo de uso do EjbBuilder para SSR
 */

import { EjbBuilder } from "../src/builder";
import { EJBNodeJSResolver } from "../src/resolvers";

// 1. Criar instância do builder
const builder = new EjbBuilder({
	root: "./views",
	dist: "./dist",
	resolver: EJBNodeJSResolver(),
	aliases: {
		"@": "./views",
	},
});

// 2. Exemplo de template EJB com SSR
const template = `
<!DOCTYPE html>
<html>
<head>
	<title>{{ it.title }}</title>
	@asset('style', 'main')
</head>
<body>
	@server
		// Código que roda apenas no servidor
		const users = await fetchUsers();
		const totalUsers = users.length;
	@end

	<div class="container">
		<h1>{{ it.title }}</h1>
		<p>Total de usuários: {{ totalUsers }}</p>

		@hydrate
			<button id="loadMore">Carregar mais</button>
		@end
	</div>

	@client
		// Código que roda apenas no cliente
		const loadMoreBtn = document.getElementById('loadMore');
		loadMoreBtn.addEventListener('click', async () => {
			const response = await fetch('/api/users?offset=10');
			const newUsers = await response.json();
			renderUsers(newUsers);
		});

		function renderUsers(users) {
			const container = document.querySelector('.user-list');
			users.forEach(user => {
				const div = document.createElement('div');
				div.textContent = user.name;
				container.appendChild(div);
			});
		}
	@end

	@style
		.container {
			max-width: 1200px;
			margin: 0 auto;
			padding: 20px;
		}

		.user-list {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
			gap: 20px;
		}

		button {
			background: #0066cc;
			color: white;
			padding: 10px 20px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}

		button:hover {
			background: #0052a3;
		}
	@end

	@asset('script', 'main')
</body>
</html>
`;

// 3. Compilar o template
async function buildApp() {
	// Definir o arquivo atual
	builder.file("@/main.ejb");

	// Parse do template
	const ast = builder.parser(template);

	// Compilar para cada loader
	for (const loader of ["server", "client", "css"] as const) {
		builder.load(loader);
		const code = await builder.compile(ast);
		builder.res(code, loader);
	}

	// Gerar build
	const manifest = await builder.build();

	console.log("Build completo!");
	console.log("Manifest:", JSON.stringify(manifest, null, 2));

	/**
	 * Estrutura gerada:
	 * dist/
	 * ├── se-main.a1b2c3d4.js    (server code)
	 * ├── cl-main.e5f6g7h8.js    (client code)
	 * ├── st-main.i9j0k1l2.css   (styles)
	 * └── ejb.json                (manifest)
	 */
}

// 4. Renderizar no servidor
async function renderPage() {
	const result = await builder.renderBuilt("@/main.ejb", {
		title: "Minha Aplicação SSR",
	});

	console.log("HTML renderizado:", result);
}

// 5. Exemplo de uso com framework web
/*
import { serve } from "bun";

serve({
	port: 3000,
	async fetch(req) {
		const url = new URL(req.url);

		// Servir assets estáticos
		if (url.pathname.startsWith("/assets/")) {
			const filename = url.pathname.split("/").pop();
			const file = Bun.file(`./dist/${filename}`);
			return new Response(file);
		}

		// Renderizar página
		if (url.pathname === "/") {
			const html = await builder.renderBuilt("@/main.ejb", {
				title: "Minha App",
			});

			// Injetar assets
			const assets = await builder.getAssets("@/main.ejb");
			const clientJs = assets.find(a => a.startsWith("cl-"));
			const css = assets.find(a => a.endsWith(".css"));

			const htmlWithAssets = html
				.replace("@asset('script', 'main')", `<script src="/assets/${clientJs}"></script>`)
				.replace("@asset('style', 'main')", `<link rel="stylesheet" href="/assets/${css}">`);

			return new Response(htmlWithAssets, {
				headers: { "Content-Type": "text/html" },
			});
		}

		return new Response("Not Found", { status: 404 });
	},
});
*/

// Exemplo de uso da diretiva @let com builder
const letExample = `
@let counter = 0

@server
	// No servidor, inicializa o contador
	counter = await getInitialCount();
@end

<div>
	<span id="counter">{{ counter }}</span>
	<button id="increment">+</button>
</div>

@client
	// No cliente, adiciona interatividade
	document.getElementById('increment').onclick = () => {
		counter++;
		document.getElementById('counter').textContent = counter;
	};
@end
`;

// Executar exemplos
if (import.meta.main) {
	await buildApp();
	await renderPage();
}

export { builder, buildApp, renderPage, template, letExample };
