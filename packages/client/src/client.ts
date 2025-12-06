// client.ts
export default () => {
  // -----------------------------
  // Global State & helpers
  // -----------------------------

  let activeEffect: (() => void) | null = null;

  const escapeAttrName = (name: string) => name.replace(/:/g, '\\:');
  const buildAttrSelector = (attr: string, value: string) =>
    `[${escapeAttrName(attr)}=${JSON.stringify(value)}]`;

  // -----------------------------
  // kire.varLocals + Proxy
  // -----------------------------

  const varLocals = new WeakMap<Element, Record<string, any>>();
  let currentElement: Element | null = null;

  const resolveLocal = (start: Element | null, name: string): any => {
    let el: Element | null = start;
    while (el) {
      const locals = varLocals.get(el);
      if (locals && name in locals) return locals[name];
      el = el.parentElement;
    }
    return undefined;
  };

  const localsProxy: any = new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        if (!currentElement) return undefined;
        return resolveLocal(currentElement, String(prop));
      },
      has(_target, prop: string | symbol) {
        if (typeof prop === 'symbol') return false;
        if (!currentElement) return false;
        return resolveLocal(currentElement, String(prop)) !== undefined;
      }
    }
  );

  // -----------------------------
  // Signals + Effects
  // -----------------------------

  const createSignal = (initialValue: any) => {
    let value = initialValue;
    const subscribers = new Set<() => void>();

    const read = () => {
      if (activeEffect) {
        subscribers.add(activeEffect);
      }
      return value;
    };

    const write = (newValue: any) => {
      if (typeof newValue === 'function') {
        value = newValue(value);
      } else {
        value = newValue;
      }
      [...subscribers].forEach((fn) => fn());
      return value;
    };

    const signal = (...args: any[]) => {
      if (args.length === 0) return read();
      return write(args[0]);
    };

    // marca como signal pra gente conseguir diferenciar de funções normais
    (signal as any).__kireSignal = true;

    // Para {{ signal }} imprimir o valor
    (signal as any).toString = () => String(read());
    (signal as any).toJSON = () => read();

    // Iterável se for array (for...of em signal)
    (signal as any)[Symbol.iterator] = function* () {
      const v = read();
      if (Array.isArray(v)) {
        yield* v;
      }
    };

    // Computed / derived signal: $state(() => ...)
    if (typeof initialValue === 'function') {
      const computedEffect = () => {
        const newValue = initialValue();
        if (newValue !== value) {
          write(newValue);
        }
      };
      createEffect(computedEffect);
    }

    return signal;
  };

  const createEffect = (
    fn: () => void,
    deps?: Array<() => any>,
    debounceMs: number = 0
  ) => {
    let timeout: any;

    const work = () => {
      fn();
    };

    const run = () => {
      if (debounceMs > 0) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          activeEffect = run;
          work();
          activeEffect = null;
        }, debounceMs);
      } else {
        activeEffect = run;
        work();
        activeEffect = null;
      }
    };

    if (deps && Array.isArray(deps) && deps.length) {
      activeEffect = run;
      deps.forEach((d) => {
        if (typeof d === 'function') d();
      });
      activeEffect = null;
      work();
    } else {
      run();
    }

    return run;
  };

  // -----------------------------
  // Scanner / Binder de DOM
  // -----------------------------

  const scanAndBind = (root: Element, scope: any) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      null
    );

    let node: Node | null = walker.currentNode;

    while (node) {
      const targetNode = node;

      // 1. Text nodes com {{ ... }}
      if (
        targetNode.nodeType === Node.TEXT_NODE &&
        targetNode.textContent &&
        targetNode.textContent.includes('{{')
      ) {
        const originalText = targetNode.textContent;

        const exprRegex = /{{(.*?)}}/g;
        const bindings: Array<{ raw: string; fn: (scope: any) => any }> = [];
        let match: RegExpExecArray | null;

        while ((match = exprRegex.exec(originalText))) {
          const raw = match[0];
          const code = match[1].trim();
          try {
            const exprFn = new Function(
              'scope',
              `with(scope) { return ${code} }`
            ) as (scope: any) => any;
            bindings.push({ raw, fn: exprFn });
          } catch (e) {
            console.error('[Kire] Error compiling', code, e);
          }
        }

        if (bindings.length) {
          createEffect(() => {
            let newText = originalText;

            bindings.forEach(({ raw, fn }) => {
              try {
                let result = fn(scope);
                if (typeof result === 'function') {
                  result = result();
                }
                newText = newText.replace(
                  raw,
                  result === undefined || result === null ? '' : String(result)
                );
              } catch (e) {
                console.error('[Kire] Error evaluating', raw, e);
              }
            });

            if (targetNode.textContent !== newText) {
              targetNode.textContent = newText;
            }
          });
        }
      }

      // 2. Elementos + atributos
      if (targetNode.nodeType === Node.ELEMENT_NODE) {
        const el = targetNode as Element;

        Array.from(el.attributes).forEach((attr) => {
          const name = attr.name;
          const value = attr.value;

          // 2.1 Atributos com {{ ... }} (modo "template" tradicional)
          if (value.includes('{{')) {
            const code = value.replace(/{{|}}/g, '').trim();
            if (!code) return;

            if (name.startsWith('on')) {
              const eventName = name.substring(2);
              el.removeAttribute(name);

              let handler: (scope: any, ev: Event) => void;
              try {
                handler = new Function(
                  'scope',
                  '$event',
                  `with(scope) { ${code} }`
                ) as (scope: any, ev: Event) => void;
              } catch (err) {
                console.error('[Kire] Event compile error', code, err);
                return;
              }

              el.addEventListener(eventName, function (e) {
                try {
                  handler.call(el, scope, e);
                } catch (err) {
                  console.error('[Kire] Event Error', code, err);
                }
              });
            } else if (name === 'kire:ref') {
              // ignore, tratado em $kire.ref
            } else {
              let attrFn: (scope: any) => any;
              try {
                attrFn = new Function(
                  'scope',
                  `with(scope) { return ${code} }`
                ) as (scope: any) => any;
              } catch (e) {
                console.error('[Kire] Attr compile error', code, e);
                return;
              }

              createEffect(() => {
                try {
                  let result = attrFn(scope);
                  if (typeof result === 'function') {
                    result = result();
                  }
                  el.setAttribute(name, String(result));
                } catch (e) {
                  // ignora erro em attr
                }
              });
            }

            return;
          }

          // 2.2 NOVO: atributos de evento no formato onclick="it.algo(...)"
          if (name.startsWith('on')) {
            const trimmed = value.trim();
            if (trimmed.startsWith('it.')) {
              const eventName = name.substring(2);
              el.removeAttribute(name);

              let handlerFn: ($locals: any, ev: Event) => void;
              try {
                handlerFn = new Function(
                  '$locals',
                  '$event',
                  `with($locals) { ${trimmed} }`
                ) as ($locals: any, ev: Event) => void;
              } catch (err) {
                console.error(
                  '[Kire] Event compile error (it.*) ' + trimmed,
                  err
                );
                return;
              }

              el.addEventListener(eventName, function (e) {
                const prev = currentElement;
                currentElement = el;
                try {
                  handlerFn.call(el, localsProxy, e);
                } catch (err) {
                  console.error(
                    '[Kire] Event Error (it.*) ' + trimmed,
                    err
                  );
                } finally {
                  currentElement = prev;
                }
              });
            }
          }
        });
      }

      node = walker.nextNode();
    }
  };

  // -----------------------------
  // Mapeia variáveis de loop (ex: todo de it.todos)
  // -----------------------------

  const assignLoopLocals = (root: Element, scope: any) => {
    const liNodes = Array.from(root.querySelectorAll('li'));
    if (!liNodes.length) return;

    const keys = Object.keys(scope);
    for (const key of keys) {
      const candidate = (scope as any)[key];

      // só signals: funções marcadas
      if (
        !candidate ||
        typeof candidate !== 'function' ||
        !(candidate as any).__kireSignal
      ) {
        continue;
      }

      let arr: any;
      try {
        arr = candidate();
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;

      // heurística simples: "todos" -> "todo", "items" -> "item"
      const singular =
        key.endsWith('s') && key.length > 1 ? key.slice(0, -1) : key;

      liNodes.forEach((li, index) => {
        if (index >= arr.length) return;
        const value = arr[index];

        const stack: Element[] = [li];
        while (stack.length) {
          const el = stack.pop()!;
          const locals = varLocals.get(el) || {};
          locals[singular] = value;
          if (!('it' in locals)) {
            locals.it = scope;
          }
          varLocals.set(el, locals);

          for (const child of Array.from(el.children)) {
            stack.push(child as Element);
          }
        }
      });
    }
  };

  // -----------------------------
  // Objeto Kire global
  // -----------------------------

  const Kire: any = {
    store: {} as Record<string, any>,
    state: createSignal,
    effect: createEffect,

    ref: (name: string, root: Document | Element = document) =>
      root.querySelector(buildAttrSelector('kire:ref', name)),

    reactive: (name: string, setup: () => any) => {
      const scope = setup();
      Kire.store[name] = scope;

      const el = Kire.ref(name) as Element | null;
      if (el) {
        const existing = varLocals.get(el) || {};
        existing.it = scope;
        varLocals.set(el, existing);

        // scan inicial (em geral não tem nada ainda dentro do @client, mas mantém compat)
        scanAndBind(el, scope);
      }
    },

    mount: (refName: string, renderFn: (ctx: any, scope: any) => any) => {
      let attempts = 0;

      const tryMount = () => {
        const scope = Kire.store[refName];

        if (scope) {
          const iterator = document.createNodeIterator(
            document.body,
            NodeFilter.SHOW_COMMENT
          );
          let currentNode: Comment | null;
          let targetNode: Comment | null = null;

          while ((currentNode = iterator.nextNode() as Comment | null)) {
            if (
              currentNode.textContent &&
              currentNode.textContent.trim() === '$' + refName
            ) {
              targetNode = currentNode;
              break;
            }
          }

          if (targetNode && targetNode.parentNode) {
            const parent = targetNode.parentNode;

            // container onde o HTML do @client vai ser renderizado/re-renderizado
            const container = document.createElement('span');
            container.setAttribute('data-kire-mount', refName);
            parent.insertBefore(container, targetNode);
            parent.removeChild(targetNode);

            const rootEl = Kire.ref(refName) as Element | null;
            if (rootEl) {
              const existing = varLocals.get(rootEl) || {};
              if (!('it' in existing)) existing.it = scope;
              varLocals.set(rootEl, existing);
            }

            // Efeito: sempre que algum signal usado no render mudar,
            // re-renderiza o HTML desse @client
            createEffect(() => {
              const ctx: any = {
                [Symbol.for('~response')]: '',
                res: (s: string) => (ctx[Symbol.for('~response')] += s)
              };

              // renderFn vem do compiler do servidor (@client)
              renderFn(ctx, scope);

              const html = ctx[Symbol.for('~response')] || '';
              const tpl = document.createElement('template');
              tpl.innerHTML = html;

              // swap de conteúdo
              container.innerHTML = '';
              container.appendChild(tpl.content);

              if (rootEl) {
                // mapeia variáveis de loop (todo de todos, item de items, etc)
                assignLoopLocals(rootEl, scope);
                // faz binding de eventos / atributos (incluindo onclick="it.*")
                scanAndBind(rootEl, scope);
              }
            });
          }
        } else {
          attempts += 1;
          if (attempts < 100) {
            setTimeout(tryMount, 10);
          } else {
            console.warn(
              '[Kire] Mount failed: Store for ' + refName + ' not found.'
            );
          }
        }
      };

      setTimeout(tryMount, 0);
    },

    varLocals,
    localsProxy,
    _getCurrentElement: () => currentElement
  };

  const win = window as any;
  win.$kire = Kire;
  win.$state = Kire.state;
  win.$effect = Kire.effect;
  win.$reactive = Kire.reactive;
  win.$mount = Kire.mount;
  win.$ref = Kire.ref;
};
