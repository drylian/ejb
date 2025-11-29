# Getting Started

Kire is a modern, lightweight template engine for Node.js, Bun, and Deno.

## Installation

```bash
npm install kire
```

## Quick Start

```typescript
import { Kire } from 'kire';

const kire = new Kire();
const html = await kire.render('<h1>Hello, {{ name }}!</h1>', { name: 'World' });
console.log(html);
```
