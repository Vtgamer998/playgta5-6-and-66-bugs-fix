(() => {
  'use strict';
  if (window.__dbgConsole) return;
  window.__dbgConsole = true;

  const TAG = '__dbgcon';
  const IS_TOP = window.top === window;
  const MAX = 600;
  const logs = [];
  let render = null;

  const fmt = (a) => {
    try {
      if (a instanceof Error) return a.name + ': ' + a.message + (a.stack ? '\n' + a.stack : '');
      if (typeof a === 'bigint') return a + 'n';
      if (typeof a === 'string') return a;
      if (typeof a === 'function') return 'function ' + (a.name || '');
      if (a && typeof a === 'object') {
        return JSON.stringify(a, (k, v) => typeof v === 'bigint' ? v + 'n' : v);
      }
      return String(a);
    } catch (e) { return '[nao serializavel]'; }
  };

  function push(lvl, txt, src) {
    const t = new Date().toTimeString().slice(0, 8);
    logs.push({ t, lvl, txt, src: src || '' });
    if (logs.length > MAX) logs.shift();
    if (render) render();
  }

  function emit(lvl, txt) {
    if (IS_TOP) push(lvl, txt);
    else { try { window.top.postMessage({ [TAG]: 1, lvl, txt, src: location.host }, '*'); } catch (e) {} }
  }

  // ---- captura console ----
  ['log', 'info', 'warn', 'error', 'debug'].forEach((lvl) => {
    const orig = console[lvl];
    console[lvl] = function (...args) {
      try { emit(lvl, args.map(fmt).join(' ')); } catch (e) {}
      return orig.apply(console, args);
    };
  });

  window.addEventListener('error', (e) => {
    emit('error', 'Uncaught: ' + (e.message || e.error) + (e.filename ? ' @ ' + e.filename + ':' + e.lineno + ':' + e.colno : ''));
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    emit('error', 'Promise rejeitada: ' + fmt(e.reason));
  });

  // ---- erros de Workers (sem alterar o script do Worker) ----
  if (typeof window.Worker === 'function') {
    window.Worker = new Proxy(window.Worker, {
      construct(target, args, nt) {
        const w = Reflect.construct(target, args, nt);
        const name = String(args[0]).split('/').pop().slice(0, 40);
        w.addEventListener('error', (e) => {
          emit('error', 'Worker[' + name + '] erro: ' + (e.message || '(sem mensagem)') +
            (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''));
        });
        w.addEventListener('messageerror', () => emit('warn', 'Worker[' + name + '] messageerror'));
        return w;
      }
    });
  }

  if (!IS_TOP) return;

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d[TAG]) push(d.lvl, d.txt, d.src);
  });

  // ---- interface ----
  function build() {
    if (document.getElementById('__dbg_host')) return;
    const host = document.createElement('div');
    host.id = '__dbg_host';
    host.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:monospace}
        #btn{position:fixed;left:6px;top:60px;width:38px;height:38px;border-radius:50%;
          background:#222c;color:#fff;border:1px solid #888;font-size:18px;line-height:36px;text-align:center}
        #panel{position:fixed;left:0;right:0;top:0;height:60vh;background:#111f;color:#ddd;
          display:none;flex-direction:column;border-bottom:2px solid #555}
        #panel.open{display:flex}
        #bar{display:flex;gap:6px;padding:6px;background:#222}
        #bar button{flex:1;padding:8px;background:#333;color:#fff;border:1px solid #666;border-radius:6px;font-size:13px}
        #list{flex:1;overflow:auto;padding:6px;font-size:11px;line-height:1.35;white-space:pre-wrap;word-break:break-all}
        .l{border-bottom:1px solid #2a2a2a;padding:2px 0}
        .error{color:#ff7b72}.warn{color:#e3b341}.info{color:#79c0ff}.debug{color:#8b949e}
        .t{color:#666}
      </style>
      <div id="btn">🐞</div>
      <div id="panel">
        <div id="bar">
          <button id="copy">Copiar</button>
          <button id="errs">So erros</button>
          <button id="clr">Limpar</button>
          <button id="cls">Fechar</button>
        </div>
        <div id="list"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const panel = $('panel'), list = $('list');
    let onlyErr = false;

    render = () => {
      if (!panel.classList.contains('open')) return;
      const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
      list.innerHTML = '';
      logs.forEach((l) => {
        if (onlyErr && l.lvl !== 'error' && l.lvl !== 'warn') return;
        const d = document.createElement('div');
        d.className = 'l ' + l.lvl;
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = l.t + ' ';
        d.appendChild(t);
        d.appendChild(document.createTextNode((l.src ? '[' + l.src + '] ' : '') + l.txt));
        list.appendChild(d);
      });
      if (atEnd) list.scrollTop = list.scrollHeight;
    };

    const text = () => logs
      .filter((l) => !onlyErr || l.lvl === 'error' || l.lvl === 'warn')
      .map((l) => l.t + ' [' + l.lvl + '] ' + (l.src ? '(' + l.src + ') ' : '') + l.txt).join('\n');

    $('btn').addEventListener('click', () => { panel.classList.add('open'); render(); list.scrollTop = list.scrollHeight; });
    $('cls').addEventListener('click', () => panel.classList.remove('open'));
    $('clr').addEventListener('click', () => { logs.length = 0; render(); });
    $('errs').addEventListener('click', (e) => {
      onlyErr = !onlyErr; e.target.textContent = onlyErr ? 'Tudo' : 'So erros'; render();
    });
    $('copy').addEventListener('click', async (e) => {
      const s = text();
      try { await navigator.clipboard.writeText(s); e.target.textContent = 'Copiado!'; }
      catch (err) {
        const ta = document.createElement('textarea');
        ta.value = s; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); e.target.textContent = 'Copiado!'; } catch (e2) { e.target.textContent = 'Falhou'; }
        ta.remove();
      }
      setTimeout(() => { e.target.textContent = 'Copiar'; }, 1500);
    });

    (document.body || document.documentElement).appendChild(host);
    push('info', 'Debug Console pronto.');
  }

  const start = () => build();
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  // se a pagina remover o elemento (ex.: tela cheia), recoloca
  setInterval(() => { if (document.body && !document.getElementById('__dbg_host')) build(); }, 2000);
})();
