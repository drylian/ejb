import type { Kire } from "./kire";

export interface KireConfig {
  globals?: Record<string, any>;
  // Add other config options as needed
}

export interface KireContext {
  param(name: string | number): any;
  render(content: string): Promise<string>; // Returns compiled function string
  func(code: string): string; // Wraps code in a function definition
  pre(code: string): void;
  res(code: string): void;
  pos(code: string): void;
  error(message: string): void;
  resolve(path: string): string;
  
  // For nested directives
  children?: Node[];
  parents?: Node[]; // The instances of sub-directives (e.g., elseif blocks)
  set(nodes: Node[]): Promise<void>;

  // Context management (compile-time, generates code)
  clone(locals?: Record<string, any>): KireContext; // Returns code string for cloning
  clear(): KireContext; // Returns code string for clearing
}

export interface KireElementContext {
  content: string; // The global HTML content (mutable/readable state representation)
  element: {
      tagName: string;
      attributes: Record<string, string>;
      inner: string;
      outer: string;
  };
  // Method to update the global content
  update(newContent: string): void;
}

export interface KireElementHandler {
    (ctx: KireElementContext): Promise<void> | void;
}

export interface DirectiveDefinition {
  name: string;
  params?: string[]; // e.g. ['filepath:string']
  children?: boolean; // Does this directive accept a block ending with @end?
  childrenRaw?: boolean; // Should the children be treated as raw text?
  parents?: DirectiveDefinition[]; // Sub-directives like elseif/else
  onCall: (ctx: KireContext) => void | Promise<void>;
}

export interface KirePlugin<Options extends (object | undefined) = {}> {
  name: string;
  options:Options;
  load(kire: Kire, opts?: Options): void;
}

// AST Types
export type NodeType = 'text' | 'variable' | 'directive';

export interface Node {
  type: NodeType;
  content?: string;
  name?: string; // For directives
  args?: any[]; // For directives
  start?: number;
  end?: number;
  children?: Node[]; // Inner content
  related?: Node[]; // For 'parents' (elseif, etc)
}
