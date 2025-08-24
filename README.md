# ETS — Embedded Template System

**ETS** (Embedded Template System) é um motor de templates leve e extensível para JavaScript, baseado em diretivas, projetado para simplificar a criação de componentes dinâmicos e reutilizáveis com uma sintaxe expressiva e intuitiva.

> 🚀 Simples como Blade, poderoso como Vue — renderize HTML de forma declarativa com JavaScript moderno.

---

## ✨ Visão Geral

ETS permite que você escreva templates HTML ou JS com diretivas como `@if`, `@for`, `@component`, entre outras. Ele processa esses arquivos e os transforma em conteúdo final renderizado, com suporte a lógica condicional, repetição, inclusão de templates e slots de componentes.

---

## 📦 Instalação

```bash
npm install @caeljs/ejb
````

---

## 🧠 Funcionalidades

### ✅ Diretivas Suportadas

* **`@code`**: Bloco de código pré-formatado.
* **`@if / @elseif / @else`**: Renderização condicional.
* **`@for`**: Laços de repetição sobre arrays ou objetos.
* **`@import`**: Inclusão de outros templates.
* **`@component` / `@slot`**: Composição de componentes com suporte a slots.
* **`@isset`**: Verifica se uma variável está definida e não é nula.

### 🧩 Tipagem e Suporte ao VS Code

O ETS oferece suporte a autocompletar e validação via JSON Schema integrado ao VS Code. Isso melhora a experiência de desenvolvimento e reduz erros de sintaxe em templates `.ejb`.

---

## 💡 Exemplo de Uso

```html
@component(path="components/card", data={ title: "Título", content: "Texto do card" })
  @slot(name="footer")
    <button>OK</button>
  @endslot
@endcomponent
```

---

## 📁 Configuração

Crie um arquivo `ejb-config.json` na raiz do projeto:

```json
{
  "$schema": "./vs-code/schemas/ejb-config.schema.json",
  "package": "@caeljs/ejb",
  "url": "https://github.com/drylian/ejb",
  "directives": [
    // Diretivas definidas aqui
  ]
}
```

---

## 🛠️ Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir *issues*, propor melhorias ou enviar *pull requests*.

### Para rodar localmente:

```bash
git clone https://github.com/drylian/ejb.git
cd ejb
npm install
npm run dev
```

---

## 🧾 Licença

Este projeto está licenciado sob a **MIT License**. Veja o arquivo [LICENSE](./LICENSE) para mais informações.

---

## 📫 Contato

Desenvolvido e mantido por [@drylian](https://github.com/drylian).
Para dúvidas, sugestões ou bugs, abra uma [issue](https://github.com/drylian/ejb/issues).

---

## 🔗 Recursos Relacionados

* [Documentação do pacote no npm](https://www.npmjs.com/package/@caeljs/ejb)
* [JSON Schema para VS Code](./vs-code/schemas/ejb-config.schema.json)

```

---

Se desejar, posso adaptar esse README para um projeto multilíngue (com versões em português e inglês) ou gerar um logo/título visual usando ASCII ou SVG. Deseja isso?
```
