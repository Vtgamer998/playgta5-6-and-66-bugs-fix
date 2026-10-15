// GTA Memory64 Fix v2 - roda no MAIN world, antes de qualquer script da pagina.
// Corrige WebAssembly.Memory na pagina E dentro de Workers (inclusive aninhados).
(function install() {
  'use strict';

  // ===== CONFIG =====
  const CFG = {
    // Limite do 'maximum' em paginas de 64 KiB. 65536 = 4 GiB (limite do Kiwi). 0 = nao limitar
    MAX_PAGES_CAP: 65536,
    BC_FALLBACK: true,  // GPU sem texture-compression-bc: converte texturas BC p/ RGBA (dados NAO decodificados)
    CLIP_FALLBACK: true, // GPU/navegador sem 'clip-distances': pede a feature se existir; senao remove clip_distances dos shaders WGSL
    BC_TINY: true,      // texturas BC viram 4x4 sem mips (os dados sao ignorados mesmo): economiza muita memoria
    LOG_GROW: true,     // registra cada memory.grow (e falhas) para diagnosticar falta de memoria
    FORCE: false,   // true = aplica o patch mesmo se o navegador ja suportar
    DEBUG: true
  };
  // ==================

  const g = typeof self !== 'undefined' ? self : globalThis;
  const tag = typeof window !== 'undefined' ? '[GTA Fix:main]' : '[GTA Fix:worker]';
  const log = (...a) => CFG.DEBUG && console.info(tag, ...a);

  if (g.__GTA_FIX_INSTALLED__) return;
  g.__GTA_FIX_INSTALLED__ = true;

  // Codigo que sera injetado em cada Worker (esta mesma funcao)
  const SRC = '(' + install.toString() + ')();';
  const CFG_SRC = 'self.__GTA_CFG__=' + JSON.stringify(CFG) + ';';
  if (g.__GTA_CFG__) Object.assign(CFG, g.__GTA_CFG__);

  let NEED_WORKER_WRAP = false;

  // ---------- 1) WebAssembly.Memory ----------
  if (typeof WebAssembly !== 'undefined' && WebAssembly.Memory) {
    const OrigMemory = WebAssembly.Memory;

    // Sonda: o navegador aceita memoria i64 com BigInt / com Number?
    const probe = (i, m) => {
      try { new OrigMemory({ initial: i, maximum: m, shared: true, address: 'i64' }); return true; }
      catch (e) { return false; }
    };
    const BIGINT_OK = probe(1n, 2n);
    const NUMBER_OK = probe(1, 2);
    const skipMem = BIGINT_OK && !CFG.FORCE;
    if (skipMem) log('Suporte nativo a Memory64 com BigInt detectado. Memory nao sera alterada.');
    const WANT_BIG = BIGINT_OK && !NUMBER_OK;
    log('Sonda: BigInt=' + BIGINT_OK + ' Number=' + NUMBER_OK);

    function FixedMemory(descriptor) {
      if (!new.target) {
        throw new TypeError("WebAssembly.Memory precisa ser chamado com 'new'");
      }
      const o = { ...descriptor };
      for (const k of ['initial', 'maximum']) {
        if (WANT_BIG) { if (typeof o[k] === 'number') o[k] = BigInt(o[k]); }
        else if (typeof o[k] === 'bigint') o[k] = Number(o[k]);
      }
      const num = (v) => Number(v);
      if (CFG.MAX_PAGES_CAP > 0 && o.maximum !== undefined && num(o.maximum) > CFG.MAX_PAGES_CAP) {
        log('maximum reduzido', num(o.maximum), '->', CFG.MAX_PAGES_CAP);
        const v = Math.max(CFG.MAX_PAGES_CAP, num(o.initial || 0));
        o.maximum = WANT_BIG ? BigInt(v) : v;
      }
      log('Memory:', o);
      const NT = new.target === FixedMemory ? OrigMemory : new.target;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return Reflect.construct(OrigMemory, [o], NT);
        } catch (e) {
          const m = e instanceof RangeError && /upper bound (\d+)/.exec(e.message || '');
          if (m && /maximum/.test(e.message) && attempt < 2) {
            const bound = Math.max(Number(m[1]), num(o.initial || 0));
            log('maximum acima do limite, reajustando', num(o.maximum), '->', bound);
            o.maximum = WANT_BIG ? BigInt(bound) : bound;
            continue;
          }
          console.error(tag, 'Falha ao criar Memory:', e.name, e.message, o);
          throw e;
        }
      }
    }
    FixedMemory.prototype = OrigMemory.prototype;
    Object.setPrototypeOf(FixedMemory, OrigMemory);
    if (!skipMem) Object.defineProperty(WebAssembly, 'Memory', {
      value: FixedMemory, writable: true, configurable: true
    });
    NEED_WORKER_WRAP = !skipMem;
  }

  // ---------- 1b) Diagnostico: memory.grow ----------
  if (CFG.LOG_GROW && typeof WebAssembly !== 'undefined' && WebAssembly.Memory &&
      WebAssembly.Memory.prototype.grow) {
    const oGrow = WebAssembly.Memory.prototype.grow;
    WebAssembly.Memory.prototype.grow = function (delta) {
      let before = 0;
      try { before = this.buffer.byteLength; } catch (e) {}
      try {
        const r = oGrow.call(this, delta);
        let after = 0;
        try { after = this.buffer.byteLength; } catch (e) {}
        log('grow +' + Math.round(Number(delta) * 64 / 1024) + ' MB: ' +
            Math.round(before / 1048576) + ' -> ' + Math.round(after / 1048576) + ' MB');
        return r;
      } catch (e) {
        console.error(tag, 'GROW FALHOU: pedido +' + Math.round(Number(delta) * 64 / 1024) +
          ' MB, atual ' + Math.round(before / 1048576) + ' MB:', e.name, e.message);
        throw e;
      }
    };
  }

  // ---------- 2) Worker (cria Workers ja com o patch) ----------
  if (typeof g.Worker === 'function' && (NEED_WORKER_WRAP || CFG.BC_FALLBACK)) {
    const OrigWorker = g.Worker;
    const baseHref = g.__GTA_NESTED_BASE__ || g.__GTA_BASE__ || g.location.href;
    let wcount = 0;

    // le o codigo de um blob:/data: de forma sincrona (evita corrida com revokeObjectURL)
    const readInline = (u) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', u, false);
        x.send();
        if (x.status === 200 || x.status === 0) return x.responseText;
      } catch (e) { log('nao consegui ler worker inline:', String(e)); }
      return null;
    };

    g.Worker = new Proxy(OrigWorker, {
      construct(target, args, newTarget) {
        const n = ++wcount;
        try {
          const [url, opts = {}] = args;
          const abs = new URL(String(url), baseHref).href;
          const isModule = opts && opts.type === 'module';
          if (/^(blob|data):/.test(abs)) {
            // Worker inline: embute o codigo original depois do patch
            const inline = isModule ? null : readInline(abs);
            if (inline === null) {
              console.warn(tag, 'Worker #' + n + ' inline NAO patchado (' + (isModule ? 'module' : 'leitura falhou') + '):', abs.slice(0, 60));
              return Reflect.construct(target, args, newTarget);
            }
            const code = CFG_SRC + 'self.__GTA_NESTED_BASE__=' + JSON.stringify(baseHref) + ';' +
              SRC + '\n' + inline;
            const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
            log('Worker #' + n + ' inline interceptado (' + inline.length + ' bytes)');
            return Reflect.construct(target, [blobUrl, opts], newTarget);
          }
          const load = isModule
            ? 'await import(' + JSON.stringify(abs) + ');'
            : 'importScripts(' + JSON.stringify(abs) + ');';
          const code = CFG_SRC +
            'self.__GTA_BASE__=' + JSON.stringify(abs) + ';' +
            SRC + load;
          const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          log('Worker #' + n + ' interceptado:', abs);
          return Reflect.construct(target, [blobUrl, opts], newTarget);
        } catch (e) {
          console.warn(tag, 'Falha no patch do Worker #' + n + ', usando original:', e);
          return Reflect.construct(target, args, newTarget);
        }
      }
    });
  }

  // ---------- 3) Dentro de Worker blob: resolve URLs relativas ----------
  // O Worker roda em blob:, entao '/b/.../game.js' vira URL invalida.
  // Aqui reapontamos a base para a URL original do script.
  if (typeof window === 'undefined' && g.__GTA_BASE__ && /^blob:/.test(g.location.href)) {
    const base = g.__GTA_BASE__;
    const R = (u) => {
      try { return new URL(String(u), base).href; } catch (e) { return u; }
    };

    // location -> URL original (Emscripten usa self.location.href)
    try {
      Object.defineProperty(g, 'location', { value: new URL(base), configurable: true, writable: true });
    } catch (e) { console.warn(tag, 'nao consegui sobrescrever location', e); }

    // importScripts
    const origImport = g.importScripts;
    if (typeof origImport === 'function') {
      g.importScripts = function (...urls) {
        return origImport.apply(g, urls.map(R));
      };
    }

    // fetch
    const origFetch = g.fetch;
    if (typeof origFetch === 'function') {
      g.fetch = function (input, init) {
        if (typeof input === 'string' || input instanceof URL) input = R(input);
        return origFetch.call(g, input, init);
      };
    }

    // XMLHttpRequest
    if (g.XMLHttpRequest) {
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        return origOpen.call(this, method, R(url), ...rest);
      };
    }
    log('Base relativa ajustada para', base);
  }

  // ---------- 4) WebGPU: fallback para texturas BC ----------
  // GPUs sem 'texture-compression-bc' (ex.: Mali) falham em createTexture com formatos bc*.
  // Aqui criamos a textura em formato descomprimido e IGNORAMOS os dados enviados
  // (as texturas ficam vazias), so para o jogo conseguir passar do carregamento.
  if (CFG.BC_FALLBACK && typeof GPUDevice !== 'undefined' && GPUDevice.prototype.createTexture) {
    const MAP = {
      'bc1-rgba-unorm': 'rgba8unorm', 'bc1-rgba-unorm-srgb': 'rgba8unorm-srgb',
      'bc2-rgba-unorm': 'rgba8unorm', 'bc2-rgba-unorm-srgb': 'rgba8unorm-srgb',
      'bc3-rgba-unorm': 'rgba8unorm', 'bc3-rgba-unorm-srgb': 'rgba8unorm-srgb',
      'bc7-rgba-unorm': 'rgba8unorm', 'bc7-rgba-unorm-srgb': 'rgba8unorm-srgb',
      'bc4-r-unorm': 'r8unorm', 'bc4-r-snorm': 'r8snorm',
      'bc5-rg-unorm': 'rg8unorm', 'bc5-rg-snorm': 'rg8snorm',
      'bc6h-rgb-ufloat': 'rgba16float', 'bc6h-rgb-float': 'rgba16float'
    };
    const fake = new WeakSet();
    let counted = 0;

    const oCreate = GPUDevice.prototype.createTexture;
    GPUDevice.prototype.createTexture = function (desc) {
      if (desc && MAP[desc.format] && !this.features.has('texture-compression-bc')) {
        const d = Object.assign({}, desc, { format: MAP[desc.format] });
        if (CFG.BC_TINY) {
          const sz = desc.size;
          const w = Array.isArray(sz) ? sz[0] : sz.width;
          const h = (Array.isArray(sz) ? sz[1] : sz.height) || 1;
          const l = (Array.isArray(sz) ? sz[2] : sz.depthOrArrayLayers) || 1;
          d.mipLevelCount = 1;
          d.size = {
            width: Math.min(w, 4),
            height: desc.dimension === '1d' ? 1 : Math.min(h, 4),
            depthOrArrayLayers: desc.dimension === '3d' ? Math.min(l, 4) : l
          };
        }
        if (desc.viewFormats) {
          d.viewFormats = [...new Set(desc.viewFormats.map((v) => MAP[v] || v))].filter((v) => v !== d.format);
        }
        const t = oCreate.call(this, d);
        fake.add(t);
        if (counted++ < 3) log('BC -> ' + d.format + ' (' + desc.format + ')');
        return t;
      }
      return oCreate.call(this, desc);
    };

    const oView = GPUTexture.prototype.createView;
    GPUTexture.prototype.createView = function (vd) {
      if (fake.has(this) && vd) {
        vd = Object.assign({}, vd);
        if (MAP[vd.format]) vd.format = MAP[vd.format];
        if (CFG.BC_TINY) { delete vd.baseMipLevel; delete vd.mipLevelCount; }
      }
      return oView.call(this, vd);
    };

    if (typeof GPUQueue !== 'undefined') {
      const oWrite = GPUQueue.prototype.writeTexture;
      GPUQueue.prototype.writeTexture = function (dst, data, layout, size) {
        if (dst && fake.has(dst.texture)) return;
        return oWrite.call(this, dst, data, layout, size);
      };
    }
    if (typeof GPUCommandEncoder !== 'undefined') {
      const P = GPUCommandEncoder.prototype;
      const oB2T = P.copyBufferToTexture;
      P.copyBufferToTexture = function (src, dst, size) {
        if (dst && fake.has(dst.texture)) return;
        return oB2T.call(this, src, dst, size);
      };
      const oT2B = P.copyTextureToBuffer;
      P.copyTextureToBuffer = function (src, dst, size) {
        if (src && fake.has(src.texture)) return;
        return oT2B.call(this, src, dst, size);
      };
      const oT2T = P.copyTextureToTexture;
      P.copyTextureToTexture = function (src, dst, size) {
        const a = src && fake.has(src.texture), b = dst && fake.has(dst.texture);
        if (a || b) return;
        return oT2T.call(this, src, dst, size);
      };
    }
    log('Fallback de texturas BC ativo.');
  }

  // ---------- 5) WebGPU: clip_distances ----------
  // Erro: "extension 'clip_distances' is not allowed in the current environment".
  // O device foi criado sem a feature 'clip-distances', entao todo shader com
  // `enable clip_distances;` falha e os pipelines ficam invalidos (-> crash em SetProgramResources).
  // (a) Se o adapter suporta, pedimos a feature no requestDevice.
  // (b) Se o device nao tem a feature, removemos clip_distances do WGSL (sem user clip planes).
  if (CFG.CLIP_FALLBACK) {
    if (typeof GPUAdapter !== 'undefined' && GPUAdapter.prototype.requestDevice) {
      const oReq = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = function (desc) {
        try {
          if (this.features && this.features.has('clip-distances')) {
            desc = Object.assign({}, desc || {});
            const rf = new Set(desc.requiredFeatures || []);
            if (!rf.has('clip-distances')) {
              rf.add('clip-distances');
              desc.requiredFeatures = [...rf];
              log("Feature 'clip-distances' adicionada ao requestDevice.");
            }
          } else {
            log("Adapter sem 'clip-distances': usando fallback no WGSL.");
          }
        } catch (e) { console.warn(tag, 'requestDevice patch falhou:', e); }
        return oReq.call(this, desc);
      };
    }

    // divide por virgulas de nivel 0 (ignora (), [], {} e <> de tipos como vec4<f32>)
    const splitTop = (str) => {
      const parts = []; let d = 0, a = 0, cur = '';
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') d--;
        else if (c === '<' && /\w/.test(str[i - 1] || '') && str[i + 1] !== '=') a++;
        else if (c === '>' && a > 0 && str[i - 1] !== '-') a--;
        if (c === ',' && d === 0 && a === 0) { parts.push(cur); cur = ''; } else cur += c;
      }
      if (cur.trim() !== '') parts.push(cur);
      return parts;
    };

    // acha o ')' que fecha o '(' em str[open]
    const matchParen = (str, open) => {
      let d = 0;
      for (let i = open; i < str.length; i++) {
        if (str[i] === '(') d++;
        else if (str[i] === ')') { d--; if (d === 0) return i; }
      }
      return -1;
    };

    const stripClip = (code) => {
      if (typeof code !== 'string' || code.indexOf('clip_distances') < 0) return code;
      let out = code;
      // 1) diretiva enable (aceita lista: enable f16, clip_distances;)
      out = out.replace(/\benable\s+([^;]*);/g, (m, list) => {
        const rest = list.split(',').map((x) => x.trim()).filter((x) => x && x !== 'clip_distances');
        return rest.length ? 'enable ' + rest.join(', ') + ';' : '';
      });

      // 2) structs com @builtin(clip_distances): remove o membro E o argumento
      //    correspondente (mesma posicao) em todo construtor posicional Nome(a, b, ...)
      const names = new Set();
      const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/g;
      const edits = [];
      let sm;
      while ((sm = structRe.exec(out))) {
        if (sm[2].indexOf('clip_distances') < 0) continue;
        const members = splitTop(sm[2]);
        const idx = members.findIndex((x) => /@builtin\(\s*clip_distances\s*\)/.test(x));
        if (idx < 0) continue;
        const mm = /(\w+)\s*:/.exec(members[idx].replace(/@\w+(\([^)]*\))?/g, ''));
        if (mm) names.add(mm[1]);
        edits.push({ name: sm[1], idx, count: members.length });
        const kept = members.filter((_, i) => i !== idx).map((x) => x.trim()).filter(Boolean);
        out = out.slice(0, sm.index) + 'struct ' + sm[1] + ' {\n  ' + kept.join(',\n  ') +
              ',\n}' + out.slice(sm.index + sm[0].length);
        structRe.lastIndex = sm.index + 1;
      }
      for (const e of edits) {
        const callRe = new RegExp('\\b' + e.name + '\\s*\\(', 'g');
        let cm, res = '', last = 0;
        while ((cm = callRe.exec(out))) {
          // ignora a propria declaracao (fn x(...)/struct x) e usos como tipo
          const open = cm.index + cm[0].length - 1;
          const close = matchParen(out, open);
          if (close < 0) break;
          const args = splitTop(out.slice(open + 1, close));
          if (args.length === e.count) {
            args.splice(e.idx, 1);
            res += out.slice(last, open + 1) + args.join(',');
            last = close;
          }
          callRe.lastIndex = close;
        }
        out = res + out.slice(last);
      }

      // 3) membro removido nao pode mais ser lido/escrito: x.nome = ...; x.nome[0] = ...;
      for (const n of names) {
        const re = new RegExp('[\\w\\.\\[\\]]*\\.' + n + '\\s*(?:\\[[^\\]]*\\])?\\s*=(?!=)[^;]*;', 'g');
        out = out.replace(re, '');
      }
      // 4) fallback: @builtin(clip_distances) solto (ex.: parametro de funcao)
      out = out.replace(/@builtin\(\s*clip_distances\s*\)\s*\w+\s*:\s*array<\s*f32\s*,\s*[^>]+>\s*,?/g, '');
      return out;
    };

    if (typeof GPUDevice !== 'undefined' && GPUDevice.prototype.createShaderModule) {
      const oShader = GPUDevice.prototype.createShaderModule;
      let shown = 0, patched = 0;
      GPUDevice.prototype.createShaderModule = function (desc) {
        try {
          if (desc && typeof desc.code === 'string' && desc.code.indexOf('clip_distances') >= 0 &&
              !this.features.has('clip-distances')) {
            const code = stripClip(desc.code);
            patched++;
            if (patched % 100 === 0) log('shaders patchados ate agora: ' + patched);
            if (shown++ < 3) {
              log('clip_distances removido do shader "' + (desc.label || '?') + '"' +
                  (code.indexOf('clip_distances') >= 0 ? ' (AINDA RESTA clip_distances!)' : ''));
            }
            if (code.indexOf('clip_distances') >= 0) {
              console.warn(tag, 'Sobrou clip_distances em', desc.label, '\n' +
                desc.code.split('\n').filter((l) => /clip_distances/.test(l)).join('\n'));
            }
            desc = Object.assign({}, desc, { code });
          }
        } catch (e) { console.warn(tag, 'createShaderModule patch falhou:', e); }
        return oShader.call(this, desc);
      };
      log('Fallback de clip_distances ativo.');
    }
  }

  log('Instalado (v4.5) em ' + (g.location ? g.location.href.slice(0, 80) : '?'));
})();
