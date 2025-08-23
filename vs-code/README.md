# EJB VSCode Extension

Uma extensão VSCode para suporte completo à linguagem EJB (template engine similar ao Blade do Laravel) com syntax highlighting, autocomplete e hover documentation.

## Funcionalidades

### ✨ Syntax Highlighting
- Destaque de sintaxe roxo para diretivas EJB (`@if`, `@for`, `@code`, etc.)
- Suporte a blocos de código JavaScript dentro de `@code...@end`
- Suporte a blocos CSS dentro de `@css...@end`
- Destaque para expressões `{{ }}`
- Syntax highlighting para HTML padrão

### 🔍 IntelliSense
- **Autocomplete**: Digite `@` e veja todas as diretivas disponíveis
- **Snippets inteligentes**: Diretivas com parâmetros criam placeholders automaticamente
- **Blocos automáticos**: Diretivas que requerem `@end` são inseridas com o bloco completo

### 📖 Hover Documentation
- Passe o mouse sobre qualquer diretiva para ver:
  - Descrição completa da diretiva
  - Lista de parâmetros e seus tipos
  - Diretivas relacionadas (como `@elseif` e `@else` para `@if`)
  - Informações sobre blocos filhos

### ⚙️ Configuração Dinâmica
- Lê arquivos `ejb-config.json` da raiz do workspace
- Carrega configurações de pacotes em `node_modules`
- Merge automático de múltiplas configurações
- Reload automático quando configurações mudam

## Instalação

1. Clone este repositório
2. Execute `npm install` para instalar dependências
3. Execute `bun run build` para compilar a extensão
4. Pressione `F5` para abrir uma nova janela VSCode com a extensão carregada

## Configuração

### Arquivo ejb-config.json

Crie um arquivo `ejb-config.json` na raiz do seu projeto ou em qualquer pacote npm:

```json
{
  "$schema": "./schemas/ejb-config.schema.json",
  "package": "@meupackage/ejb",
  "url": "https://github.com/usuario/meupackage",
  "directives": [
    {
      "name": "minhadiretiva",
      "description": "Descrição da minha diretiva personalizada",
      "children": true,
      "children_type": "html",
      "params": [
        {
          "name": "parametro1",
          "type": "string"
        }
      ]
    }
  ]
}
```

### Schema de Configuração

A extensão inclui validação JSON Schema para arquivos `ejb-config.json`:

- **package**: Nome do pacote (obrigatório)
- **url**: URL de documentação (opcional)
- **directives**: Array de diretivas (obrigatório)

#### Propriedades das Diretivas:

- **name**: Nome da diretiva sem '@'
- **description**: Descrição para hover e autocomplete
- **children**: Se a diretiva aceita conteúdo filho (requer @end)
- **children_type**: Tipo do conteúdo filho ("html", "js", "css")
- **params**: Array de parâmetros aceitos
- **parents**: Sub-diretivas relacionadas

## Exemplo de Uso

```ejb
@import('@/components/header')

@css
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }
@end

@code
  const items = [1, 2, 3, 4, 5];
  const title = 'Minha Lista';
@end

<div class="container">
  <h1>{{ title }}</h1>
  
  @if(items.length > 0)
    <ul>
      @for(let item in items)
        <li>Item: {{ item }}</li>
      @end
    </ul>
  @else
    <p>Nenhum item encontrado.</p>
  @end
</div>

@head
```

## Comandos de Build

```bash
# Compilar a extensão
bun run build

# Watch mode para desenvolvimento
bun run watch

# Empacotar para distribuição
npm run package
```

## Estrutura do Projeto

```
├── src/
│   └── extension.ts          # Lógica principal da extensão
├── syntaxes/
│   └── ejb.tmLanguage.json   # Grammar para syntax highlighting
├── schemas/
│   └── ejb-config.schema.json # JSON Schema para validação
├── language-configuration.json # Configuração da linguagem
├── package.json              # Manifesto da extensão
└── README.md
```

## Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature
3. Faça commit das mudanças
4. Abra um Pull Request

## Licença

MIT License