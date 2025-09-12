# EJB Language Support for VS Code

This extension provides comprehensive language support for the EJB template engine in Visual Studio Code, including syntax highlighting, intelligent code completion, and hover information.

## Features

- **Syntax Highlighting**: Clear and distinct highlighting for EJB directives (`@if`, `@for`, etc.), expressions (`{{ }}`), and embedded CSS and JavaScript blocks.
- **IntelliSense**: Get smart autocompletions for all registered EJB directives when you type `@`.
- **Snippets**: Directives that accept parameters or have child content will automatically generate snippets to speed up your workflow.
- **Hover Information**: Hover over any directive to see a detailed description, parameters, and related directives.
- **Dynamic Configuration**: The extension automatically discovers and loads `ejbconfig.json` files from your workspace and `node_modules`, providing support for project-specific and library-provided directives.
- **Automatic Reloading**: The extension watches for changes to your configuration files and reloads automatically, so your editor is always up-to-date.

## Installation

1.  Clone this repository.
2.  Install dependencies: `npm install`
3.  Compile the extension: `bun run vscode:prepublish`
4.  Press `F5` to open a new VS Code window with the extension loaded for debugging.

To create a distributable `.vsix` file, run `npm run build`.

## Configuration

Create an `ejbconfig.json` file in the root of your project or in any of your npm packages to define custom directives.

**`ejbconfig.json` example:**

```json
{
  "$schema": "./schemas/ejbconfig.schema.json",
  "package": "@my-package/ejb-directives",
  "url": "https://github.com/my-org/my-package",
  "directives": [
    {
      "name": "myDirective",
      "description": "A custom directive for my project.",
      "children": true,
      "params": [
        {
          "name": "config",
          "type": "object"
        }
      ]
    }
  ]
}
```

## Development

- `bun run vscode:prepublish`: Compile the extension.
- `bun run watch`: Compile in watch mode for active development.

## Project Structure

```
.vscode/
├── src/
│   ├── extension.ts            # Main extension activation logic
│   ├── config_manager.ts       # Loads and manages ejbconfig.json files
│   ├── completion_provider.ts  # Provides IntelliSense for directives
│   └── hover_provider.ts       # Provides hover documentation
├── syntaxes/
│   └── ejb.tmLanguage.json     # TextMate grammar for syntax highlighting
└── package.json                # Extension manifest
```

## License

MIT
