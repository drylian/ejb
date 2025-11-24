# EJB - A Powerful and Flexible Template Engine

EJB is a lightweight, powerful, and flexible template engine for JavaScript and TypeScript, designed to be intuitive and easy to use. It supports custom directives, async operations, layouts, partials, and **Server-Side Rendering (SSR)**, making it a great choice for a wide range of applications.

## Features

- **Simple Syntax**: Uses familiar `{{ variable }}` syntax for interpolation.
- **Custom Directives**: Extend the engine with your own logic using `@` prefixed directives.
- **Asynchronous Support**: Seamlessly handle async operations within your templates.
- **Layouts and Partials**: Easily manage complex page structures with `@import`, `@component`, and `@layout` directives.
- **Regex-Based Directives**: Create powerful directives that match custom regular expressions.
- **Scoped and Global Variables**: Control variable scope with global and local variables.
- **Variable Exposure**: Automatically expose global variables for direct access in templates.
- **Extensible**: Highly customizable with a powerful directive API.
- **Written in TypeScript**: Provides strong typing for better development experience.
- **🆕 SSR Support**: Build applications with automatic code-splitting for server, client, and CSS.
- **🆕 Builder API**: `EjbBuilder` class for advanced build workflows.

## Installation

```bash
npm install ejb
```

## Usage

Here's a simple "Hello World" example:

```javascript
import { Ejb } from '@caeljs/ejb';

const ejb = new Ejb();

const template = 'Hello, {{ name }}!';
const locals = { name: 'World' };

const output = ejb.render(template, locals);

console.log(output); // Output: Hello, World!
```

## API Reference

### `new Ejb(options)`

Creates a new `Ejb` instance.

**Options:**

- `globals` (object): An object of global variables available in all templates.
- `async` (boolean): Set to `true` to enable async mode. Default is `false`.
- `resolver` (function): A function to resolve template paths for `@import` and `@component`.
- `aliases` (object): A map of path aliases for the resolver.
- `globalexpose` (boolean): If `true` (default), global variables are exposed directly in templates.
- `globalvar` (string): The name of the global variable object. Default is `'it'`.
- `extension` (string): The default file extension for templates. Default is `'ejb'`.
- `root` (string): The root directory for resolving template paths.
- `directives` (object): An object of custom directives to register.

### `ejb.render(template, locals)`

Renders a template string with the given local variables.

- `template` (string): The template string or a path to a template file.
- `locals` (object): An object of local variables for the template.

### `ejb.makeFunction(template)`

Compiles a template into a reusable function.

- `template` (string): The template string or a path to a template file.

## Directives

EJB comes with a set of built-in directives for common tasks.

### Control Flow

- `@if(condition) ... @else ... @end`
- `@for(expression) ... @end`
- `@switch(expression) ... @case(value) ... @default ... @end`

### Including Templates

- `@import(path, locals)`: Imports another template.
- `@component(path, locals) ... @slot(name) ... @end`: For component-based structures.

### Layouts

- `@layout(path)`: Defines the layout for the current template.
- `@stack(name)`: Renders a stack of content.
- `@push(name) ... @end`: Pushes content to a stack.
- `@define(name) ... @end`: Defines a block of content.
- `@defined(name)`: Renders a defined block.

### Other Directives

- `@code ... @end`: Executes the content as JavaScript code.
- `@isset(variable)`: Checks if a variable is defined and not null.
- `@once ... @end`: Renders a block of content only once.

### Regex-Based Directives

You can create directives that are triggered by a regular expression match.

```javascript
const customDirective = {
    name: /<my-custom-tag>/,
    onNameResolver: (ejb, match) => {
        return 'This is a custom tag!';
    }
};

ejb.register(customDirective);

const output = ejb.render('<my-custom-tag>');
console.log(output); // Output: This is a custom tag!
```

## Custom Directives

Creating your own directives is easy. Here's a simple example:

```javascript
import { ejbDirective } from '@caeljs/ejb';

const myDirective = ejbDirective({
    name: 'myDirective',
    onParams: (ejb, expression) => {
        return `$ejb.res += 'Hello from my directive: ' + ${expression};`;
    }
});

ejb.register(myDirective);

const output = ejb.render('@myDirective("test")');
console.log(output); // Output: Hello from my directive: test
```

## Configuration

### `globalexpose`

By default, `globalexpose` is `true`, which means variables from the `globals` option are directly available in templates.

```javascript
const ejb = new Ejb({
    globals: { myVar: 'Hello' }
});

// {{ myVar }} will be rendered as 'Hello'
ejb.render('{{ myVar }}');
```

If you set `globalexpose: false`, you need to access them through the `globalvar` object (default is `it`).

```javascript
const ejb = new Ejb({
    globalexpose: false,
    globals: { myVar: 'Hello' }
});

// {{ it.myVar }} will be rendered as 'Hello'
// {{ myVar }} will throw a ReferenceError
ejb.render('{{ it.myVar }}');
```

## Server-Side Rendering (SSR)

EJB now supports SSR with automatic code-splitting for server, client, and CSS!

### Quick Start

```typescript
import { EjbBuilder } from '@caeljs/ejb';

const builder = new EjbBuilder({
  root: './views',
  dist: './dist',
  resolver: EJBNodeJSResolver()
});

// Your template
const template = `
<div>
  @server
    const data = await fetchData();
  @end

  <h1>{{ data.title }}</h1>

  @client
    document.querySelector('button').onclick = () => {
      alert('Clicked!');
    };
  @end

  @style
    .container { max-width: 1200px; }
  @end
</div>
`;

// Build
builder.file('@/main.ejb');
const ast = builder.parser(template);
await builder.compile(ast);
await builder.build();
```

### New Directives

- `@server`: Code that runs only on the server
- `@client`: Code that runs only in the browser
- `@style`: CSS styles for the component
- `@hydrate`: Mark content for client-side hydration
- `@asset`: Include generated assets (JS/CSS)

### Learn More

See [SSR.md](./SSR.md) for complete documentation on Server-Side Rendering features.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
