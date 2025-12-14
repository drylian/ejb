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

function renderCodeWithLineNumbers(code: string): string {
  const lines = code.split("\n");
  return lines
    .map((line, i) => {
      const ln = i + 1;
      return `
        <div class="group flex text-[13px] leading-6 hover:bg-white/5">
          <div class="select-none w-14 shrink-0 text-right pr-4 text-slate-500 border-r border-white/10 bg-slate-950/40">
            ${ln}
          </div>
          <div class="pl-4 whitespace-pre text-slate-200 font-mono">
            ${escapeHtml(line)}
          </div>
        </div>
      `.trim();
    })
    .join("");
}

export function renderErrorPage(params: ErrorPageParams): string {
  const { error, req, files } = params;

  const errorTitle = String(error?.message || "Internal Server Error");
  const stack = String(error?.stack || "");
  const generatedCode = String(error?.kireGeneratedCode || "");
  const codeFrame = String(error?.codeFrame || "");
  const url = String(req?.url || "/");

  const exceptionCard = `
    <section class="rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 overflow-hidden">
      <div class="px-6 py-5 border-b border-white/10">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-rose-300">
              <span class="inline-flex h-2 w-2 rounded-full bg-rose-400"></span>
              EXCEPTION
            </div>
            <h2 class="mt-2 text-lg font-semibold text-white break-words">${escapeHtml(
              errorTitle,
            )}</h2>
            <p class="mt-1 text-sm text-slate-400">
              Um erro aconteceu ao processar a requisição.
            </p>
          </div>

          <div class="flex flex-col items-end gap-2">
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
              Status: <span class="ml-1 text-rose-300">500</span>
            </span>
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 font-mono">
              ${escapeHtml(url)}
            </span>
          </div>
        </div>
      </div>

      <div class="p-6 space-y-5">
        ${
          codeFrame
            ? `
          <div>
            <div class="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Code frame</div>
            <pre class="rounded-xl border border-white/10 bg-slate-950/60 p-4 overflow-auto text-[13px] leading-6 text-rose-200 font-mono whitespace-pre-wrap">${escapeHtml(
              codeFrame,
            )}</pre>
          </div>
        `.trim()
            : ""
        }

        <div>
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Stack trace</div>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 active:scale-[0.99]"
              onclick="navigator.clipboard?.writeText(document.getElementById('kire-stack')?.innerText || '')"
              title="Copiar stack trace"
            >
              Copiar
              <span class="opacity-70">⌘/Ctrl+C</span>
            </button>
          </div>
          <pre id="kire-stack" class="rounded-xl border border-white/10 bg-slate-950/60 p-4 overflow-auto text-[13px] leading-6 text-slate-200 font-mono whitespace-pre-wrap">${escapeHtml(
            stack,
          )}</pre>
        </div>
      </div>

      <div class="h-1 bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500"></div>
    </section>
  `.trim();

  const generatedCodeCard = generatedCode
    ? `
    <section class="rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 overflow-hidden">
      <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-4">
        <div>
          <div class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Generated source</div>
          <h3 class="mt-1 text-base font-semibold text-white">Generated Source Code (Debug)</h3>
          <p class="mt-1 text-sm text-slate-400">Código gerado pelo Kire para ajudar no diagnóstico.</p>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 active:scale-[0.99]"
          onclick="navigator.clipboard?.writeText(document.getElementById('kire-generated')?.innerText || '')"
          title="Copiar código"
        >
          Copiar
          <span class="opacity-70">📋</span>
        </button>
      </div>

      <div class="p-0">
        <div class="bg-slate-950/70 border-t border-white/10">
          <div id="kire-generated" class="max-h-[600px] overflow-auto font-mono">
            ${renderCodeWithLineNumbers(generatedCode)}
          </div>
        </div>
      </div>
    </section>
  `.trim()
    : "";

  const cachedFilesCard = `
    <section class="rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 overflow-hidden">
      <div class="px-6 py-5 border-b border-white/10">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Cached files</div>
            <h3 class="mt-1 text-base font-semibold text-white">
              Cached Files <span class="text-slate-400 font-medium">(${files.length})</span>
            </h3>
          </div>

          <div class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
            Live Reload: <span class="ml-2 inline-flex items-center gap-2 text-emerald-300">
              <span class="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span> ON
            </span>
          </div>
        </div>
      </div>

      <div class="p-6">
        <div class="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40">
          <ul class="divide-y divide-white/10">
            ${
              files.length
                ? files
                    .map(
                      (f) => `
                <li class="px-4 py-3 text-[13px] text-slate-200 font-mono break-all hover:bg-white/5">
                  ${escapeHtml(String(f))}
                </li>
              `.trim(),
                    )
                    .join("")
                : `<li class="px-4 py-6 text-sm text-slate-400">Nenhum arquivo em cache.</li>`
            }
          </ul>
        </div>
      </div>
    </section>
  `.trim();

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Kire Error: ${escapeHtml(errorTitle)}</title>

  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- (Opcional) Ajustes mínimos via config -->
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            mono: ['ui-monospace','SFMono-Regular','Menlo','Monaco','Consolas','"Liberation Mono"','"Courier New"','monospace']
          }
        }
      }
    }
  </script>
</head>

<body class="min-h-screen bg-slate-950 text-slate-100">
  <div class="absolute inset-0 -z-10">
    <div class="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900"></div>
    <div class="absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-fuchsia-600/10 blur-3xl"></div>
    <div class="absolute -bottom-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-3xl"></div>
  </div>

  <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header class="mb-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="inline-flex items-center gap-3">
            <span class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
              <span class="text-xl">⚠️</span>
            </span>
            <div>
              <h1 class="text-2xl font-semibold text-white">Kire Error</h1>
              <p class="text-sm text-slate-400">Página de erro com informações de debug (dev).</p>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
            Env: <span class="ml-1 text-slate-300">Development</span>
          </span>
          <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 font-mono">
            ${escapeHtml(url)}
          </span>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div class="lg:col-span-7 space-y-6">
        ${exceptionCard}
        ${generatedCodeCard}
      </div>

      <aside class="lg:col-span-5 space-y-6">
        ${cachedFilesCard}

        <section class="rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 overflow-hidden">
          <div class="px-6 py-5 border-b border-white/10">
            <div class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Tips</div>
            <h3 class="mt-1 text-base font-semibold text-white">Ações rápidas</h3>
          </div>
          <div class="p-6 space-y-3 text-sm text-slate-300">
            <button
              type="button"
              class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 active:scale-[0.99]"
              onclick="window.location.reload()"
            >
              🔄 Recarregar página
              <div class="text-xs text-slate-400 mt-1">Tenta novamente com o mesmo request.</div>
            </button>

            <button
              type="button"
              class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 active:scale-[0.99]"
              onclick="navigator.clipboard?.writeText(document.documentElement.outerHTML)"
            >
              📄 Copiar HTML da página
              <div class="text-xs text-slate-400 mt-1">Útil para enviar num issue.</div>
            </button>
          </div>
        </section>
      </aside>
    </div>
  </main>

  <script>
    // Auto reload on file change even in error page
    (() => {
      const evtSource = new EventSource("/kire-livereload");
      evtSource.onmessage = (event) => {
        if (event.data === "reload") {
          console.log("[Kire] Reloading...");
          window.location.reload();
        }
      };
    })();
  </script>
</body>
</html>
  `.trim();
}
