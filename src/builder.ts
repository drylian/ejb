import type { Ejb } from "./ejb";
import { escapeHtml, escapeJs, escapeString } from "./utils";
import type { AstNode, RootNode } from "./types";

export type LoaderType = "server" | "client" | "css";

export type FileArtefact = {
    loader: LoaderType;
    content: string;
};

/**
 * The EjbBuilder class is the context passed to directives during the build process.
 * It provides methods to handle SSR output generation and access to the main EJB instance's methods.
 */
export class EjbBuilder {
    /** The main EJB instance */
    public ins: Ejb;

    private _currentFile: string | null = null;
    private _loader: LoaderType = "server";

    public readonly escapeHtml = escapeHtml;
    public readonly escapeJs = escapeJs;
    public readonly escapeString = escapeString;
    public readonly EjbFunction: Function;

    constructor(ejbInstance: Ejb) {
        this.ins = ejbInstance;
        this.EjbFunction = ejbInstance.getFunction();
    }

    // --- Delegated methods from Ejb ---
    public parser(code: string): RootNode {
        return this.ins.parser(code);
    }

    public compile(node: AstNode | AstNode[], stringMode = false): Promise<string> {
        // NOTE: This delegates to the *original* compiler, which returns a JS string.
        // This is useful for directives that need to compile a piece of template to a string,
        // but it will not participate in the new build system automatically.
        return this.ins.compile(node, stringMode);
    }
    // ------------------------------------

    /**
     * Sets the current file context for the builder. All subsequent calls to `add()`
     * will be associated with this file.
     * @param filepath The absolute path of the file being processed.
     */
    public file(filepath: string): this {
        this._currentFile = filepath;
        if (!this.ins.files[filepath]) {
            this.ins.files[filepath] = [];
        }
        return this;
    }

    /**
     * Gets the current file path being processed.
     */
    public get current(): string {
        if (!this._currentFile) {
            throw new Error("EJB: Internal error. No file context set in builder.");
        }
        return this._currentFile;
    }

    /**
     * Sets the current loader type ('server', 'client', or 'css').
     * Subsequent calls to `add()` without a type override will use this loader.
     * @param type The loader type to switch to.
     */
    public load(type: LoaderType): this {
        this._loader = type;
        return this;
    }

    /**
     * Gets the current loader type.
     */
    public get loader(): LoaderType {
        return this._loader;
    }

    /**
     * Appends a string of content to a specific build artefact (server, client, or css).
     * @param text The content to add.
     * @param type The loader type to target. Defaults to the currently active loader set by `load()`.
     */
    public add(text: string, type?: LoaderType): this {
        const targetLoader = type || this._loader;
        
        const currentFile = this.current;

        let artefact = this.ins.files[currentFile]?.find(f => f.loader === targetLoader);

        if (!artefact) {
            artefact = { loader: targetLoader, content: "" };
            this.ins.files[currentFile].push(artefact);
        }

        artefact.content += text;
        return this;
    }
}