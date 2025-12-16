import type { IncomingMessage } from "node:http";
import type { Kire } from "kire";

export interface ErrorPageParams {
  error: any;
  req: IncomingMessage;
  files: string[];
  kire: Kire;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderErrorPage(params: ErrorPageParams): string {
  const { error, req, files, kire } = params;

  const errorTitle = escapeHtml(String(error?.message || "Internal Server Error"));
  const stack = escapeHtml(String(error?.stack || ""));
  const generatedCode = escapeHtml(String(error?.kireGeneratedCode || ""));
  const codeFrame = escapeHtml(String(error?.codeFrame || ""));
  const url = escapeHtml(String(req?.url || "/"));
  const method = escapeHtml(String((req as any)?.method || "GET"));

  // Get compilation chain from Kire instance (if available)
  const compilationChain: string[] = (kire as any).$compilationChain || [];

  const hasCodeFrame = Boolean(codeFrame && codeFrame.trim().length > 0);
  const hasGeneratedCode = Boolean(generatedCode && generatedCode.trim().length > 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Error: ${errorTitle}</title>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/@iconify/iconify@3.0/dist/iconify.min.js"></script>
  <script>
    // Optional: small theme adjustments (no custom CSS)
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", "monospace"],
            sans: ["-apple-system","BlinkMacSystemFont","Segoe UI","Roboto","sans-serif"]
          }
        }
      }
    };
  </script>
</head>

<body class="min-h-screen bg-zinc-900 text-slate-200 font-sans">
  <div class="mx-auto max-w-6xl px-5 py-8">
    <!-- Header -->
    <header class="relative mb-8 pl-10">
      <div class="absolute -left-10 -top-8 -z-10 select-none text-[160px] leading-none font-black text-red-500/10">500</div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold tracking-[0.2em] uppercase text-red-300/90">
          Kire Error
        </span>
        <span class="text-slate-500">•</span>
        <span class="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500">
          Internal Server Error
        </span>
      </div>

      <h1 class="mt-2 text-2xl sm:text-3xl font-bold text-white break-words">
        ${errorTitle}
      </h1>

      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span class="inline-flex items-center gap-2 rounded-md bg-sky-500/10 px-2.5 py-1 font-mono text-sky-300">
          <span class="text-sky-200/80">${method}</span>
          <span class="text-sky-300">${url}</span>
        </span>

        <span class="inline-flex items-center gap-2 rounded-md bg-slate-800 px-2.5 py-1 text-slate-300">
          <span class="text-slate-400">Cached:</span>
          <span class="font-semibold text-slate-200">${files.length}</span>
          <span class="text-slate-400">files</span>
        </span>

        <span class="inline-flex items-center gap-2 rounded-md bg-slate-800 px-2.5 py-1 text-slate-300">
          <span class="text-slate-400">Chain:</span>
          <span class="font-semibold text-slate-200">${compilationChain.length}</span>
          <span class="text-slate-400">steps</span>
        </span>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
      <button data-tab="stack"
        class="tab-btn inline-flex items-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-slate-800 hover:text-slate-100">
        <span class="iconify" data-icon="mdi:bug-outline"></span>
        Stack Trace
      </button>

      <button data-tab="files"
        class="tab-btn inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100">
        <span class="iconify" data-icon="mdi:file-multiple-outline"></span>
        Cached Files <span class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">${files.length}</span>
      </button>

      <button data-tab="chain"
        class="tab-btn inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100">
        <span class="iconify" data-icon="mdi:link-variant"></span>
        Compilation Chain
      </button>

      ${hasCodeFrame ? `
        <button data-tab="codeframe"
          class="tab-btn inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100">
          <span class="iconify" data-icon="mdi:code-braces"></span>
          Code Frame
        </button>
      ` : ""}

      ${hasGeneratedCode ? `
        <button data-tab="generated"
          class="tab-btn inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100">
          <span class="iconify" data-icon="mdi:code-json"></span>
          Generated Code
        </button>
      ` : ""}
    </nav>

    <!-- Layout -->
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Main panel -->
      <main class="lg:col-span-2 space-y-6">
        <!-- Stack -->
        <section data-tab-panel="stack" class="tab-panel space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Stack Trace</h2>

            <button type="button" data-copy-from="stack-pre"
              class="inline-flex items-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/30">
              <span class="iconify" data-icon="mdi:content-copy"></span>
              Copy
            </button>
          </div>

          <pre id="stack-pre"
            class="max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">${stack}</pre>
        </section>

        <!-- Code Frame -->
        ${hasCodeFrame ? `
        <section data-tab-panel="codeframe" class="tab-panel hidden space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Code Frame</h2>

            <button type="button" data-copy-from="codeframe-pre"
              class="inline-flex items-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/30">
              <span class="iconify" data-icon="mdi:content-copy"></span>
              Copy
            </button>
          </div>

          <pre id="codeframe-pre"
            class="max-h-[70vh] overflow-auto rounded-lg border border-red-500/30 bg-red-500/10 p-4 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words text-red-200">${codeFrame}</pre>
        </section>
        ` : ""}

        <!-- Generated -->
        ${hasGeneratedCode ? `
        <section data-tab-panel="generated" class="tab-panel hidden space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Generated Code</h2>

            <button type="button" data-copy-from="generated-pre"
              class="inline-flex items-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/30">
              <span class="iconify" data-icon="mdi:content-copy"></span>
              Copy
            </button>
          </div>

          <pre id="generated-pre"
            class="max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed whitespace-pre text-emerald-200">${generatedCode}</pre>
        </section>
        ` : ""}

        <!-- Chain -->
        <section data-tab-panel="chain" class="tab-panel hidden space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Compilation Chain</h2>

            <button type="button" data-copy-chain="1"
              class="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
              <span class="iconify" data-icon="mdi:content-copy"></span>
              Copy list
            </button>
          </div>

          <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
            ${
              compilationChain.length > 0
                ? compilationChain
                    .map((file: string, i: number) => {
                      const safeFile = escapeHtml(String(file));
                      const isFirst = i === 0;
                      const isLast = i === compilationChain.length - 1;

                      const accent = isFirst
                        ? "border-red-400/60 bg-red-500/5"
                        : isLast
                          ? "border-rose-300/60 bg-rose-500/5"
                          : "border-sky-400/50 bg-sky-500/5";

                      const badge = isFirst
                        ? `<span class="ml-2 rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-200">Entry</span>`
                        : isLast
                          ? `<span class="ml-2 rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-200">Error</span>`
                          : "";

                      return `
                        <div class="mb-2 last:mb-0 rounded-md border-l-4 ${accent} px-3 py-2">
                          <div class="flex items-start gap-3">
                            <span class="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-200">${i + 1}</span>
                            <div class="min-w-0">
                              <div class="font-mono text-sm text-slate-100 break-words">${safeFile}${badge}</div>
                            </div>
                          </div>
                        </div>
                      `;
                    })
                    .join("")
                : `<div class="px-3 py-10 text-center text-slate-400">No compilation chain available.</div>`
            }
          </div>
        </section>

        <!-- Files -->
        <section data-tab-panel="files" class="tab-panel hidden space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-semibold tracking-wider uppercase text-slate-400">
              Cached Files (${files.length})
            </h2>

            <button type="button" data-copy-files="1"
              class="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
              <span class="iconify" data-icon="mdi:content-copy"></span>
              Copy list
            </button>
          </div>

          <div class="rounded-lg border border-slate-800 bg-slate-950">
            <div class="max-h-[70vh] overflow-auto p-2">
              ${
                files.length
                  ? files
                      .map(
                        (f) => `
                          <div class="rounded-md px-3 py-2 font-mono text-xs sm:text-sm text-slate-200 hover:bg-slate-800 break-words">
                            ${escapeHtml(String(f))}
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="px-3 py-10 text-center text-slate-500">No files in cache.</div>`
              }
            </div>
            <div class="border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
              ${files.length} files cached for hot reload.
            </div>
          </div>
        </section>
      </main>

      <!-- Side panel -->
      <aside class="space-y-6">
        <section class="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <h3 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Quick Actions</h3>

          <div class="mt-3 grid gap-2">
            <button type="button" data-action="reload"
              class="inline-flex items-center justify-center gap-2 rounded-md bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/30">
              <span class="iconify" data-icon="mdi:reload"></span>
              Reload Page
            </button>

            <button type="button" data-action="copy-text-report"
              class="inline-flex items-center justify-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
              <span class="iconify" data-icon="mdi:file-document-outline"></span>
              Copy Text Report
            </button>

            <button type="button" data-action="copy-html"
              class="inline-flex items-center justify-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
              <span class="iconify" data-icon="mdi:code-tags"></span>
              Copy HTML
            </button>

            <button type="button" data-action="back"
              class="inline-flex items-center justify-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
              <span class="iconify" data-icon="mdi:arrow-left"></span>
              Back
            </button>
          </div>
        </section>

        <section class="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-xs font-semibold tracking-wider uppercase text-slate-400">Kire Dev Server</h3>
            <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">v1.0</span>
          </div>

          <div class="mt-3 text-sm text-slate-400">
            <p class="mb-2">This error page is generated by the Kire development server.</p>
            <p>Use tabs to navigate between error details and system information.</p>
          </div>
        </section>
      </aside>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast"
    class="pointer-events-none fixed bottom-4 right-4 hidden max-w-sm rounded-lg border border-slate-800 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-lg">
    <div class="flex items-center gap-2">
      <span class="iconify text-green-400" data-icon="mdi:check-circle-outline"></span>
      <span id="toast-msg">Copied to clipboard!</span>
    </div>
  </div>

  <script>
    (function () {
      const btns = Array.from(document.querySelectorAll(".tab-btn"));
      const panels = Array.from(document.querySelectorAll(".tab-panel"));

      function setActiveTab(name) {
        // Panels
        panels.forEach(p => {
          const isTarget = p.getAttribute("data-tab-panel") === name;
          p.classList.toggle("hidden", !isTarget);
        });

        // Buttons
        btns.forEach(b => {
          const isTarget = b.getAttribute("data-tab") === name;
          b.classList.toggle("bg-sky-500/20", isTarget);
          b.classList.toggle("text-sky-300", isTarget);
          b.classList.toggle("hover:bg-slate-800", isTarget);

          b.classList.toggle("bg-slate-800", !isTarget);
          b.classList.toggle("text-slate-300", !isTarget);
          b.classList.toggle("hover:bg-slate-700", !isTarget);
        });
      }

      btns.forEach(b => {
        b.addEventListener("click", () => setActiveTab(b.getAttribute("data-tab")));
      });

      // default tab
      setActiveTab("stack");

      // Toast
      let toastTimer = null;
      function toast(msg) {
        const el = document.getElementById("toast");
        const msgEl = document.getElementById("toast-msg");
        if (!el || !msgEl) return;

        msgEl.textContent = msg || "Copied to clipboard!";
        el.classList.remove("hidden");

        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
      }

      // Generate comprehensive text report
      function generateTextReport() {
        const now = new Date();
        const report = [
          "=".repeat(60),
          "KIRE ERROR REPORT",
          "=".repeat(60),
          "Timestamp: " + now.toISOString(),
          "Error: " + ${JSON.stringify(errorTitle)},
          "URL: " + ${JSON.stringify(method)} + " " + ${JSON.stringify(url)},
          "",
          "STACK TRACE:",
          ${JSON.stringify(stack)},
          "",
          "COMPILATION CHAIN (" + ${JSON.stringify(compilationChain.length)} + " steps):"
        ];

        ${JSON.stringify(compilationChain)}.forEach((file, i) => {
          const prefix = i === 0 ? "[Entry] " : i === ${JSON.stringify(compilationChain)}.length - 1 ? "[Error] " : "";
          report.push((i + 1) + ". " + prefix + file);
        });

        report.push(
          "",
          "CACHED FILES (" + ${JSON.stringify(files.length)} + "):"
        );

        ${JSON.stringify(files)}.forEach(f => {
          report.push("• " + f);
        });

        report.push(
          "",
          "CODE FRAME:",
          ${JSON.stringify(codeFrame || "No code frame available")},
          "",
          "GENERATED CODE:",
          ${JSON.stringify(generatedCode || "No generated code available")},
          "=".repeat(60),
          "End of Report",
          "=".repeat(60)
        );

        return report.join("\\n");
      }

      // Clipboard helpers
      async function copyText(text) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            toast("Copied to clipboard!");
            return true;
          }
        } catch (_) {}

        // fallback
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "true");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          toast("Copied to clipboard!");
          return true;
        } catch (err) {
          console.error("Error copying:", err);
          toast("Failed to copy");
          return false;
        }
      }

      // Copy buttons (from element)
      document.querySelectorAll("[data-copy-from]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-copy-from");
          const el = document.getElementById(id);
          const text = el ? el.innerText : "";
          copyText(text);
        });
      });

      // Copy chain/files as list
      const chain = ${JSON.stringify(compilationChain)};
      const files = ${JSON.stringify(files)};

      const chainBtn = document.querySelector("[data-copy-chain]");
      if (chainBtn) {
        chainBtn.addEventListener("click", () => copyText(chain.join("\\n")));
      }

      const filesBtn = document.querySelector("[data-copy-files]");
      if (filesBtn) {
        filesBtn.addEventListener("click", () => copyText(files.join("\\n")));
      }

      // Quick actions
      document.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", () => {
          const action = btn.getAttribute("data-action");
          if (action === "reload") window.location.reload();
          if (action === "copy-text-report") copyText(generateTextReport());
          if (action === "copy-html") copyText(document.documentElement.outerHTML);
          if (action === "back") history.back();
        });
      });

      // Auto-reload (dev)
      if (typeof EventSource !== "undefined") {
        try {
          const evtSource = new EventSource("/kire-livereload");
          evtSource.onmessage = (e) => {
            if (e.data === "reload") {
              console.log("[Kire] Reloading due to file changes...");
              window.location.reload();
            }
          };
        } catch (e) {
          // ignore
        }
      }
    })();
  </script>
</body>
</html>
  `;
}