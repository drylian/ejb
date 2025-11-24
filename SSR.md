# EJB SSR (Server-Side Rendering)

O EJB agora suporta SSR com separação automática de código entre server, client e CSS.

## EjbBuilder

A classe `EjbBuilder` estende `Ejb` e adiciona funcionalidades para build e SSR.

### Conceito

Cada arquivo `.ejb` é compilado em 3 versões diferentes:

- **Server** (`se-*.js`): Código que executa no servidor
- **Client** (`cl-*.js`): Código que executa no navegador
- **CSS** (`st-*.css`): Estilos da aplicação

### API

```typescript
import { EjbBuilder } from '@caeljs/ejb';

const builder = new EjbBuilder({
  root: './views',
  dist: './dist',
  resolver: EJBNodeJSResolver(),
  aliases: { '@': './views' }
});

// Definir arquivo atual
builder.file('@/main.ejb');

// Obter arquivo atual
builder.current // '@/main.ejb'

// Definir loader atual
builder.load('server' | 'client' | 'css');

// Obter loader atual
builder.loader // 'server'

// Adicionar conteúdo ao loader
builder.res('const x = 1;'); // usa loader atual
builder.res('const y = 2;', 'client'); // específico
```

### Estrutura de Dados

```typescript
builder.files = {
  '@/main.ejb': [
    { loader: 'server', content: '...' },
    { loader: 'client', content: '...' },
    { loader: 'css', content: '...' }
  ]
}
```

### Build

```typescript
const manifest = await builder.build();

// Gera:
// dist/
// ├── se-main.[hash].js
// ├── cl-main.[hash].js
// ├── st-main.[hash].css
// └── ejb.json
```

### Manifest (ejb.json)

```json
{
  "paths": {
    "@/main.ejb": {
      "entry": "se-main.a1b2c3d4.js",
      "assets": [
        "cl-main.e5f6g7h8.js",
        "st-main.i9j0k1l2.css"
      ]
    }
  }
}
```

## Novas Diretivas

### @server

Código que executa apenas no servidor.

```ejb
@server
  const users = await database.query('SELECT * FROM users');
  const count = users.length;
@end

<p>Total: {{ count }}</p>
```

### @client

Código que executa apenas no navegador.

```ejb
<button id="btn">Click me</button>

@client
  document.getElementById('btn').onclick = () => {
    alert('Clicked!');
  };
@end
```

### @style

Define estilos CSS para o componente.

```ejb
@style
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .button {
    background: blue;
    color: white;
  }
@end

<div class="container">
  <button class="button">Action</button>
</div>
```

### @hydrate

Marca conteúdo para hidratação no cliente.

```ejb
@hydrate
  <button onclick="handleClick()">Interactive</button>
@end

@client
  function handleClick() {
    console.log('Clicked!');
  }
@end
```

### @asset

Inclui assets (JS/CSS) no HTML.

```ejb
<head>
  <title>My App</title>
  @asset('style', 'main')
</head>
<body>
  <!-- conteúdo -->
  @asset('script', 'main')
</body>
```

## Diretivas Atualizadas

### @let (com suporte a SSR)

```ejb
@let counter = 0

@server
  counter = await getInitialCount();
@end

<span>{{ counter }}</span>

@client
  // Atualizar contador no cliente
  setInterval(() => {
    counter++;
    updateUI(counter);
  }, 1000);
@end
```

## Exemplo Completo

```ejb
<!DOCTYPE html>
<html>
<head>
  <title>{{ it.title }}</title>
  @asset('style', 'main')
</head>
<body>
  @server
    const products = await fetchProducts();
  @end

  <div class="products">
    @for(const product of products)
      <div class="product-card">
        <h3>{{ product.name }}</h3>
        <p>{{ product.price }}</p>
        <button data-id="{{ product.id }}">Add to Cart</button>
      </div>
    @end
  </div>

  @client
    document.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        addToCart(id);
      };
    });

    function addToCart(productId) {
      fetch('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ productId })
      });
    }
  @end

  @style
    .products {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .product-card {
      border: 1px solid #ddd;
      padding: 20px;
      border-radius: 8px;
    }

    .product-card button {
      width: 100%;
      padding: 10px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  @end

  @asset('script', 'main')
</body>
</html>
```

## Workflow de Build

1. **Desenvolvimento**: Use `Ejb` normal
2. **Build**: Use `EjbBuilder` para gerar arquivos
3. **Deploy**: Sirva os arquivos gerados

```typescript
// build.ts
import { EjbBuilder } from '@caeljs/ejb';

const builder = new EjbBuilder({
  root: './src/views',
  dist: './dist',
  resolver: EJBNodeJSResolver()
});

// Compilar todos os templates
await builder.compileFile('./src/views/main.ejb');
await builder.compileFile('./src/views/about.ejb');

// Gerar build
await builder.build();
```

```typescript
// server.ts
import { EjbBuilder } from '@caeljs/ejb';

const builder = new EjbBuilder({
  dist: './dist'
});

// Carregar manifest
await builder.loadManifest();

// Servir aplicação
serve({
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/') {
      const html = await builder.renderBuilt('@/main.ejb', {
        title: 'Home'
      });

      return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }
});
```

## Vantagens

1. **Separação clara**: Código server/client separado
2. **Otimização**: Apenas o necessário em cada ambiente
3. **Type-safe**: TypeScript em toda aplicação
4. **DX**: Syntax highlighting e intellisense
5. **Performance**: Cache via hash de conteúdo
6. **Hidratação**: Suporte para SSR + interatividade

## Comparação com Blade/Twig

| Feature | Blade/Twig | EJB SSR |
|---------|-----------|---------|
| Server-side | ✅ | ✅ |
| Client-side | ❌ | ✅ |
| CSS Scoping | ❌ | ✅ |
| Type-safe | ❌ | ✅ |
| Build System | ❌ | ✅ |
| Hydration | ❌ | ✅ |

## Roadmap

- [ ] Hot Module Replacement (HMR)
- [ ] CSS Modules
- [ ] Component Islands
- [ ] Streaming SSR
- [ ] Edge Runtime Support
