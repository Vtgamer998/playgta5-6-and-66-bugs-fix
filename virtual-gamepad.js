(() => {
  'use strict';
  if (window.__virtualGamepadInstalled) return;
  window.__virtualGamepadInstalled = true;

  const IS_TOP = window.top === window;
  const OPTS = { passive: false };
  const MSG = '__vgp';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ============================================================
   *  1. CONFIGURAÇÃO (salva por site em localStorage)
   * ============================================================ */
  const CFG_KEY = '__vgp_cfg_v2';
  const DEFAULTS = { op: 0.65, scale: 1, kbd: false, hideSys: true, hidden: false, autoFs: false };

  function loadCfg() {
    try {
      const r = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if (r && typeof r === 'object') return { ...DEFAULTS, ...r, layout: { ...(r.layout || {}) } };
    } catch (e) { /* ignora */ }
    return { ...DEFAULTS, layout: {} };
  }
  const cfg = loadCfg();
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignora */ }
  }

  // Em iframes, estas flags chegam pela página principal
  const remote = { kbd: false, hs: true };
  const kbdOn = () => (IS_TOP ? cfg.kbd : remote.kbd);
  const hideSysOn = () => (IS_TOP ? cfg.hideSys : remote.hs);

  const CONTROLS = [
    { id: 'lt', type: 'btn', label: 'LT', idx: 6, x: 7, y: 22 },
    { id: 'lb', type: 'btn', label: 'LB', idx: 4, x: 19, y: 22 },
    { id: 'rb', type: 'btn', label: 'RB', idx: 5, x: 80.5, y: 22 },
    { id: 'rt', type: 'btn', label: 'RT', idx: 7, x: 93, y: 22 },

    { id: 'back', type: 'pill', icon: 'back', idx: 8, x: 40, y: 24 },
    { id: 'guide', type: 'btn', icon: 'ring', idx: 16, x: 50, y: 24, k: 0.85 },
    { id: 'start', type: 'pill', icon: 'start', idx: 9, x: 60, y: 24 },

    { id: 'up', type: 'btn', icon: 'up', idx: 12, x: 13, y: 39, g: 'dpad' },
    { id: 'left', type: 'btn', icon: 'left', idx: 14, x: 6, y: 53, g: 'dpad' },
    { id: 'right', type: 'btn', icon: 'right', idx: 15, x: 20, y: 53, g: 'dpad' },
    { id: 'down', type: 'btn', icon: 'down', idx: 13, x: 13, y: 67, g: 'dpad' },

    { id: 'l3', type: 'btn', label: 'L3', idx: 10, x: 6, y: 86 },
    { id: 'r3', type: 'btn', label: 'R3', idx: 11, x: 94, y: 86 },

    { id: 'y', type: 'btn', label: 'Y', idx: 3, x: 87.5, y: 39, g: 'face' },
    { id: 'x', type: 'btn', label: 'X', idx: 2, x: 80.5, y: 53, g: 'face' },
    { id: 'b', type: 'btn', label: 'B', idx: 1, x: 94, y: 53, g: 'face' },
    { id: 'a', type: 'btn', label: 'A', idx: 0, x: 87.5, y: 67, g: 'face' },

    { id: 'ls', type: 'stick', ax: [0, 1], x: 26.5, y: 79 },
    { id: 'rs', type: 'stick', ax: [2, 3], x: 73.5, y: 79 }
  ];
  const CTL = Object.fromEntries(CONTROLS.map(c => [c.id, c]));

  function layoutOf(c) {
    const o = cfg.layout[c.id] || {};
    return { x: o.x ?? c.x, y: o.y ?? c.y, k: o.k ?? c.k ?? 1 };
  }

  /* ============================================================
   *  2. GAMEPAD VIRTUAL (Standard Gamepad Layout / Xbox)
   * ============================================================ */
  const makeButton = () => ({ pressed: false, touched: false, value: 0 });

  const pad = {
    id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: performance.now(),
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, makeButton),
    vibrationActuator: null,
    hapticActuators: []
  };

  const input = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(false) };

  function syncPad() {
    for (let i = 0; i < 4; i++) pad.axes[i] = input.axes[i];
    for (let i = 0; i < 17; i++) {
      const b = pad.buttons[i], p = input.buttons[i];
      b.pressed = p; b.touched = p; b.value = p ? 1 : 0;
    }
    pad.timestamp = performance.now();
  }

  let active = true;   // false = controle oculto = gamepad "desconectado"

  function fireEvent(type) {
    const ev = new Event(type);
    Object.defineProperty(ev, 'gamepad', { value: pad });
    window.dispatchEvent(ev);
  }
  function setActive(v) {
    v = !!v;
    if (v === active) return;
    active = v;
    pad.connected = v;
    fireEvent(v ? 'gamepadconnected' : 'gamepaddisconnected');
  }

  const originalGetGamepads = Navigator.prototype.getGamepads;
  function patchedGetGamepads() {
    let real = [];
    try { real = Array.from(originalGetGamepads.call(navigator) || []); } catch (e) { /* ignora */ }
    const result = [null, null, null, null];
    for (let i = 0; i < Math.min(real.length, 4); i++) result[i] = real[i] || null;
    if (active) {
      let slot = result.findIndex(g => !g);
      if (slot === -1) slot = 0;
      pad.index = slot;
      result[slot] = pad;
    }
    return result;
  }
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    value: patchedGetGamepads, writable: true, configurable: true, enumerable: true
  });

  const announce = () => { if (active) fireEvent('gamepadconnected'); };
  document.addEventListener('DOMContentLoaded', announce);
  window.addEventListener('load', () => { announce(); setTimeout(announce, 1500); });

  /* ============================================================
   *  3. COMUNICAÇÃO ENTRE FRAMES
   *     Página principal -> iframes: estado do controle e teclas
   *     iframes -> página principal: "um campo de texto recebeu foco"
   * ============================================================ */
  function relay(msg) {
    for (let i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage(msg, '*'); } catch (e) { /* ignora */ }
    }
  }

  let lastSig = '', lastSend = 0;
  function pushState(now) {
    if (!window.frames.length) return;
    const sig = input.axes.map(v => v.toFixed(3)).join() + '|' +
                input.buttons.map(b => (b ? 1 : 0)).join('') +
                (active ? 1 : 0) + (kbdOn() ? 1 : 0) + (hideSysOn() ? 1 : 0);
    if (sig !== lastSig || now - lastSend > 500) {
      lastSig = sig; lastSend = now;
      relay({ [MSG]: 1, t: 'state', a: input.axes.slice(), b: input.buttons.slice(),
              on: active, kbd: kbdOn(), hs: hideSysOn() });
    }
  }

  let showKbdFromFocus = null;   // definido na UI (somente na página principal)

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || typeof d !== 'object' || d[MSG] !== 1) return;

    if (d.t === 'state' && !IS_TOP && e.source === window.parent) {
      for (let i = 0; i < 4; i++) input.axes[i] = +d.a[i] || 0;
      for (let i = 0; i < 17; i++) input.buttons[i] = !!d.b[i];
      const prevKbd = remote.kbd;
      remote.kbd = !!d.kbd; remote.hs = !!d.hs;
      if (prevKbd && !remote.kbd) restoreInputMode();
      setActive(d.on);
      relay(d);
    } else if (d.t === 'key' && !IS_TOP && e.source === window.parent) {
      handleKey(String(d.k), !!d.d);
    } else if (d.t === 'focus' && IS_TOP) {
      if (showKbdFromFocus) showKbdFromFocus();
    }
  });

  /* ============================================================
   *  4. NÚCLEO DO TECLADO (digitação em campos e teclas de jogo)
   * ============================================================ */
  const kEvt = (type, o) => new KeyboardEvent(type, { bubbles: true, cancelable: true, composed: true, ...o });
  const codeFor = ch => /^[a-z]$/i.test(ch) ? 'Key' + ch.toUpperCase()
                      : /^[0-9]$/.test(ch) ? 'Digit' + ch : ch === ' ' ? 'Space' : '';

  const SPK = {
    BKSP:  { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    ENTER: { key: 'Enter',     code: 'Enter',     keyCode: 13 },
    TAB:   { key: 'Tab',       code: 'Tab',       keyCode: 9 },
    SPACE: { key: ' ',         code: 'Space',     keyCode: 32 }
  };
  function keyInfo(kk) {
    if (SPK[kk]) return SPK[kk];
    const isAlnum = /^[a-z0-9]$/i.test(kk);
    return { key: kk, code: codeFor(kk), keyCode: (isAlnum ? kk.toUpperCase() : kk).charCodeAt(0) };
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) {
      return !el.readOnly && !el.disabled &&
             /^(text|search|email|password|url|tel|number)$/i.test(el.type || 'text');
    }
    return false;
  }
  const isNativeField = el => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

  let lastEditable = null;

  function deepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
  const frameOf = el => (el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME')) ? el.contentWindow : null;

  function kbTarget() {
    const el = deepActive();
    if (isEditable(el)) return el;
    const le = lastEditable;
    if (le && le.isConnected && isEditable(le)) {
      const r = le.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        try { le.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
        return le;
      }
    }
    return null;
  }

  function setNative(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }
  const fireInput = (el, data, inputType) =>
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data, inputType }));

  function insertText(el, text) {
    try { if (document.execCommand('insertText', false, text)) return; } catch (e) { /* ignora */ }
    if (el.isContentEditable) return;
    const s = el.selectionStart, e2 = el.selectionEnd;
    if (el.maxLength > 0 && el.value.length >= el.maxLength && (s == null || s === e2)) return;
    if (s == null) setNative(el, el.value + text); else el.setRangeText(text, s, e2, 'end');
    fireInput(el, text, 'insertText');
  }

  function deleteBack(el) {
    try { if (document.execCommand('delete')) return; } catch (e) { /* ignora */ }
    if (el.isContentEditable) return;
    let s = el.selectionStart, e2 = el.selectionEnd;
    if (s == null) { setNative(el, el.value.slice(0, -1)); fireInput(el, null, 'deleteContentBackward'); return; }
    if (s === e2) { if (s === 0) return; s -= 1; }
    el.setRangeText('', s, e2, 'end');
    fireInput(el, null, 'deleteContentBackward');
  }

  function typeChar(el, ch) {
    const o = { key: ch, code: codeFor(ch) };
    const ok = el.dispatchEvent(kEvt('keydown', o));
    const native = isNativeField(el);
    if (ok || native) {
      const pressOk = el.dispatchEvent(kEvt('keypress', o));
      if (pressOk || native) insertText(el, ch);
    }
    el.dispatchEvent(kEvt('keyup', o));
  }

  function doBackspace(el) {
    const o = { ...SPK.BKSP, which: 8 };
    const ok = el.dispatchEvent(kEvt('keydown', o));
    if (ok || isNativeField(el)) deleteBack(el);
    el.dispatchEvent(kEvt('keyup', o));
  }

  function doEnter(el) {
    const o = { ...SPK.ENTER, which: 13 };
    if (el.dispatchEvent(kEvt('keydown', o))) {
      el.dispatchEvent(kEvt('keypress', o));
      if (el.tagName === 'TEXTAREA') insertText(el, '\n');
      else if (el.isContentEditable) { try { document.execCommand('insertParagraph'); } catch (e) { /* ignora */ } }
      else if (el.form) { try { el.form.requestSubmit(); } catch (e) { /* ignora */ } }
    }
    el.dispatchEvent(kEvt('keyup', o));
  }

  function doTab(el) {
    const o = { ...SPK.TAB, which: 9 };
    if (el.dispatchEvent(kEvt('keydown', o))) {
      const list = [...document.querySelectorAll('input,textarea,select,button,a[href],[tabindex]')]
        .filter(n => n.tabIndex >= 0 && !n.disabled && n.offsetParent !== null);
      const n = list[(list.indexOf(el) + 1) % list.length];
      if (n) n.focus();
    }
    el.dispatchEvent(kEvt('keyup', o));
  }

  function textAction(el, kk) {
    switch (kk) {
      case 'BKSP': return doBackspace(el);
      case 'ENTER': return doEnter(el);
      case 'TAB': return doTab(el);
      case 'SPACE': return typeChar(el, ' ');
      default: return typeChar(el, kk);
    }
  }

  // Sem campo de texto: manda como teclas normais (para jogos que leem o teclado)
  const heldGame = new Set();
  function gameKey(kk, down) {
    if (down) heldGame.add(kk); else if (!heldGame.delete(kk)) return;
    const ae = document.activeElement;
    const target = ae && ae !== document.documentElement ? ae : (document.body || document);
    const i = keyInfo(kk);
    target.dispatchEvent(kEvt(down ? 'keydown' : 'keyup', {
      key: i.key, code: i.code, keyCode: i.keyCode, which: i.keyCode,
      shiftKey: kk.length === 1 && kk !== kk.toLowerCase()
    }));
  }

  function handleKey(kk, down) {
    const fr = frameOf(document.activeElement);
    if (fr) {                                   // foco dentro de um iframe
      try { fr.postMessage({ [MSG]: 1, t: 'key', k: kk, d: down }, '*'); } catch (e) { /* ignora */ }
      return;
    }
    const el = kbTarget();
    if (el) { if (down) textAction(el, kk); return; }
    gameKey(kk, down);
  }

  /* ---- Teclado do Android: ocultar quando o virtual está ativo ---- */
  function suppressSys(el) {
    if (!el.hasAttribute('data-vgp-im')) el.setAttribute('data-vgp-im', el.getAttribute('inputmode') || '');
    el.setAttribute('inputmode', 'none');
  }
  function restoreInputMode() {
    document.querySelectorAll('[data-vgp-im]').forEach(el => {
      const v = el.getAttribute('data-vgp-im');
      if (v) el.setAttribute('inputmode', v); else el.removeAttribute('inputmode');
      el.removeAttribute('data-vgp-im');
    });
  }

  document.addEventListener('focusin', e => {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!isEditable(el)) return;
    lastEditable = el;
    if (!kbdOn()) return;
    if (hideSysOn()) suppressSys(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      if (IS_TOP) { if (showKbdFromFocus) showKbdFromFocus(); }
      else { try { window.top.postMessage({ [MSG]: 1, t: 'focus' }, '*'); } catch (err) { /* ignora */ } }
    }
  }, true);

  /* ============================================================
   *  5. LOOP CONTÍNUO
   * ============================================================ */
  let frame = 0;
  let uiTick = null;
  function loop(now) {
    syncPad();
    if (IS_TOP) pushState(now || performance.now());
    if (uiTick && (++frame & 31) === 0) uiTick();
    requestAnimationFrame(loop);
  }

  /* ============================================================
   *  6. INTERFACE (somente na página principal)
   * ============================================================ */
  function buildUI() {
    const host = document.createElement('div');
    host.id = '__vgp_host';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent;
          -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }

      .ui {
        --ub: clamp(40px, 14vmin, 72px);
        --us: clamp(96px, 34vmin, 180px);
        --scale: 1; --op: .65;
        position: fixed; inset: 0; pointer-events: none; color: #fff;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      }

      .layer { position: absolute; inset: 0; pointer-events: none; opacity: var(--op); }
      .ui.hidden .layer { display: none; }

      .ctl {
        position: absolute; width: var(--w); height: var(--h);
        margin: calc(var(--h) / -2) 0 0 calc(var(--w) / -2);
        pointer-events: auto; touch-action: none;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        background: rgba(10,10,12,.28);
        border: 2px solid rgba(255,255,255,.8);
        box-shadow: 0 3px 10px rgba(0,0,0,.45);
        color: #fff; font-weight: 600; font-size: calc(var(--h) * .3);
        transition: background .05s linear, transform .05s linear;
      }
      .ctl * { pointer-events: none; }
      .btn   { --w: calc(var(--ub) * var(--k,1) * var(--scale)); --h: var(--w); }
      .pill  { --w: calc(var(--ub) * 1.75 * var(--k,1) * var(--scale));
               --h: calc(var(--ub) * .62 * var(--k,1) * var(--scale)); border-radius: 999px; }
      .stick { --w: calc(var(--us) * var(--k,1) * var(--scale)); --h: var(--w);
               background: rgba(10,10,12,.22); }
      .ctl.on { background: rgba(255,255,255,.38); transform: scale(.94); }
      .stick.on { background: rgba(255,255,255,.12); transform: none; }

      .ctl svg { width: 46%; height: 46%; }
      .pill svg { width: auto; height: 62%; }
      .ring { width: 46%; height: 46%; border: 2.5px solid currentColor; border-radius: 50%; }

      .stick::before { content: ''; position: absolute; inset: 16%; border-radius: 50%;
                       border: 1.5px solid rgba(255,255,255,.45); }
      .knob {
        position: absolute; left: 50%; top: 50%; width: 40%; height: 40%;
        margin: -20% 0 0 -20%; border-radius: 50%;
        background: radial-gradient(circle, rgba(70,70,74,.55) 1.2px, transparent 1.6px) 0 0 / 9px 9px,
                    rgba(215,215,220,.9);
        box-shadow: 0 3px 8px rgba(0,0,0,.5); will-change: transform;
      }

      .ui.edit .ctl { outline: 2px dashed rgba(118,185,0,.9); outline-offset: 3px; }
      .ui.edit .ctl.sel { outline-style: solid; background: rgba(118,185,0,.3); }

      .bar { position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); left: 50%;
             transform: translateX(-50%); display: flex; gap: 8px; pointer-events: none; }
      .ui.edit .bar { display: none; }
      .bb { pointer-events: auto; width: 36px; height: 36px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; font-size: 18px;
            background: rgba(20,20,22,.6); border: 1.5px solid rgba(255,255,255,.28);
            box-shadow: 0 3px 10px rgba(0,0,0,.5); opacity: .8; touch-action: manipulation; }
      .bb svg { width: 18px; height: 18px; }
      .ui.hidden .bb { opacity: .35; }
      .bb.opt-kbd { display: none; }
      .ui.kbdon .bb.opt-kbd { display: flex; }
      .ui.hidden .bb.opt, .ui.hidden .bb.opt-kbd { display: none !important; }

      .panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
               width: min(440px, calc(100% - 24px)); max-height: calc(100% - 24px);
               overflow-y: auto; display: none; pointer-events: auto; touch-action: pan-y;
               background: rgba(24,24,27,.96); border: 1px solid rgba(255,255,255,.18);
               border-radius: 16px; padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,.65); }
      .ui.panelopen .panel { display: block; }
      .panel h3 { margin: 0 0 6px; font-size: 16px; }
      .row { display: flex; align-items: center; justify-content: space-between;
             gap: 12px; margin: 12px 0; font-size: 14px; }
      .row input[type=range] { flex: 1; accent-color: #76b900; touch-action: pan-y; }
      .val { width: 44px; text-align: right; color: #b8b8bd; font-size: 13px; }
      .sw { -webkit-appearance: none; appearance: none; width: 46px; height: 26px; flex: none;
            border-radius: 13px; background: #4a4a50; position: relative; outline: none; margin: 0; }
      .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
                   border-radius: 50%; background: #fff; transition: left .12s; }
      .sw:checked { background: #76b900; }
      .sw:checked::after { left: 23px; }
      .pbtn { flex: 1; padding: 10px 8px; border-radius: 10px; font: inherit; font-size: 14px;
              color: #fff; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); }
      .pbtn.pri { background: #76b900; border-color: #76b900; color: #0b1400; font-weight: 600; }

      .editbar { position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); left: 50%;
                 transform: translateX(-50%); display: none; align-items: center; gap: 10px;
                 flex-wrap: wrap; justify-content: center; max-width: calc(100% - 16px);
                 padding: 8px 12px; border-radius: 14px; font-size: 12.5px; pointer-events: auto;
                 background: rgba(24,24,27,.94); border: 1px solid rgba(118,185,0,.65); }
      .ui.edit .editbar { display: flex; }
      .editbar input[type=range] { width: 110px; accent-color: #76b900; touch-action: pan-y; }
      .editbar .pbtn { flex: none; padding: 7px 12px; font-size: 13px; }

      .kbd { position: absolute; left: 0; right: 0; margin: 0 auto; width: min(100%, 860px);
             bottom: env(safe-area-inset-bottom, 0px); padding: 6px; display: none;
             pointer-events: auto; touch-action: none;
             background: rgba(18,18,20,.9); border: 1px solid rgba(255,255,255,.14);
             border-radius: 12px 12px 0 0; opacity: .9; opacity: max(var(--op), .65); }
      .ui.kbdshow .kbd { display: block; }
      .kbd[data-layer="abc"] .klayer.sym { display: none; }
      .kbd[data-layer="sym"] .klayer.abc { display: none; }
      .krow { display: flex; gap: 4px; margin-bottom: 4px; }
      .krow:last-child { margin-bottom: 0; }
      .key { flex: 1; height: clamp(28px, 8vmin, 42px); display: flex; align-items: center;
             justify-content: center; border-radius: 7px; color: #fff; touch-action: none;
             font-size: clamp(13px, 3.6vmin, 18px);
             background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.14); }
      .key.w15 { flex: 1.5; } .key.w5 { flex: 5; }
      .key.act { background: rgba(255,255,255,.35); }
      .key.on  { background: rgba(118,185,0,.75); }

      .toast { position: absolute; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom, 0px));
               transform: translateX(-50%); display: none; max-width: calc(100% - 24px);
               padding: 8px 12px; border-radius: 10px; font-size: 13px; text-align: center;
               background: rgba(24,24,27,.96); border: 1px solid rgba(255,255,255,.22);
               pointer-events: none; }
      .toast.show { display: block; }
    </style>

    <div class="ui" id="ui">
      <div class="layer" id="layer"></div>
      <div class="kbd" id="kbd" data-layer="abc"></div>

      <div class="bar" id="bar">
        <div class="bb" id="bToggle">🎮</div>
        <div class="bb opt" id="bSet">⚙️</div>
        <div class="bb opt" id="bFs"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></div>
        <div class="bb opt-kbd" id="bKbd">⌨️</div>
      </div>

      <div class="panel" id="panel">
        <h3>⚙️ Configurações do controle</h3>
        <div class="row"><label>Opacidade</label>
          <input type="range" id="rOp" min="15" max="100" step="5"><span class="val" id="vOp"></span></div>
        <div class="row"><label>Tamanho geral</label>
          <input type="range" id="rSc" min="60" max="150" step="5"><span class="val" id="vSc"></span></div>
        <div class="row"><label>Teclado virtual</label>
          <input type="checkbox" class="sw" id="cKbd"></div>
        <div class="row"><label>Ocultar teclado do Android</label>
          <input type="checkbox" class="sw" id="cSys"></div>
        <div class="row"><label>Tela cheia automática</label>
          <input type="checkbox" class="sw" id="cFs"></div>
        <div class="row">
          <button class="pbtn" id="bEdit">Editar posições</button>
          <button class="pbtn" id="bReset">Restaurar posições</button>
        </div>
        <div class="row"><button class="pbtn pri" id="bClose">Fechar</button></div>
      </div>

      <div class="editbar" id="editbar">
        <span>Arraste os controles · Tamanho:</span>
        <input type="range" id="rK" min="50" max="200" step="5" disabled>
        <span class="val" id="vK">—</span>
        <button class="pbtn" id="eReset">Restaurar</button>
        <button class="pbtn pri" id="eDone">Concluir</button>
      </div>

      <div class="toast" id="toast"></div>
    </div>`;

    const $ = id => root.getElementById(id);
    const ui = $('ui'), layer = $('layer'), kbd = $('kbd');

    /* ---------- Controles ---------- */
    const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const ICONS = {
      up: SVG('M6 15l6-6 6 6'), down: SVG('M6 9l6 6 6-6'),
      left: SVG('M15 6l-6 6 6 6'), right: SVG('M9 6l6 6-6 6'),
      back: '<svg viewBox="0 0 24 24"><polygon points="16,5 7,12 16,19" fill="currentColor"/></svg>',
      start: '<svg viewBox="0 0 24 24"><polygon points="8,5 17,12 8,19" fill="currentColor"/></svg>',
      ring: '<span class="ring"></span>'
    };

    const els = {}, HOLD = {};
    CONTROLS.forEach(c => {
      const el = document.createElement('div');
      el.className = 'ctl ' + c.type;
      el.dataset.id = c.id;
      el.innerHTML = c.type === 'stick' ? '<div class="knob"></div>' : (c.icon ? ICONS[c.icon] : c.label);
      layer.appendChild(el);
      els[c.id] = el;
      if (c.type !== 'stick') HOLD[c.id] = new Set();
    });

    function applyOne(id) {
      const l = layoutOf(CTL[id]), el = els[id];
      el.style.left = l.x + '%';
      el.style.top = l.y + '%';
      el.style.setProperty('--k', l.k);
    }
    const applyAll = () => CONTROLS.forEach(c => applyOne(c.id));
    applyAll();

    /* ---------- Anexar ao DOM (inclusive em tela cheia) ---------- */
    function desiredParent() {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs && !['VIDEO', 'CANVAS', 'IFRAME'].includes(fs.tagName)) return fs;
      return document.documentElement;
    }
    function ensureAttached() {
      const p = desiredParent();
      if (p && host.parentNode !== p) p.appendChild(host);
    }
    ensureAttached();
    uiTick = ensureAttached;
    document.addEventListener('DOMContentLoaded', ensureAttached);
    document.addEventListener('fullscreenchange', ensureAttached);
    document.addEventListener('webkitfullscreenchange', ensureAttached);
    host.addEventListener('contextmenu', e => e.preventDefault());

    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(n =>
      ui.addEventListener(n, e => e.stopPropagation(), { passive: true }));
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
     'mousedown', 'mouseup', 'click', 'contextmenu'].forEach(n =>
      ui.addEventListener(n, e => e.stopPropagation()));

    /* ---------- Estado da UI ---------- */
    let panelOpen = false, editMode = false, kbShow = false;

    function refreshUI() {
      ui.classList.toggle('hidden', cfg.hidden);
      ui.classList.toggle('kbdon', cfg.kbd);
      ui.classList.toggle('kbdshow', cfg.kbd && kbShow && !cfg.hidden && !editMode);
      ui.classList.toggle('edit', editMode);
      ui.classList.toggle('panelopen', panelOpen && !editMode && !cfg.hidden);
      ui.style.setProperty('--op', cfg.op);
      ui.style.setProperty('--scale', cfg.scale);
    }

    let toastT = null;
    function showToast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(() => t.classList.remove('show'), 2600);
    }

    showKbdFromFocus = () => { if (cfg.kbd) { kbShow = true; refreshUI(); } };

    /* ---------- Tela cheia ---------- */
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    function enterFs() {
      const e = document.documentElement;
      // Evita o aviso "API can only be initiated by a user gesture"
      if (navigator.userActivation && !navigator.userActivation.isActive) return false;
      try {
        const fn = e.requestFullscreen || e.webkitRequestFullscreen;
        const p = fn && fn.call(e, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* ignora */ }
    }
    function exitFs() {
      try {
        const fn = document.exitFullscreen || document.webkitExitFullscreen;
        const p = fn && fn.call(document);
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* ignora */ }
    }
    $('bFs').addEventListener('click', () => { if (isFs()) exitFs(); else enterFs(); });

    // Tela cheia automática: tenta no primeiro toque da página
    let autoDone = false;
    const tryAutoFs = () => {
      if (!cfg.autoFs || autoDone || isFs()) return;
      if (navigator.userActivation && !navigator.userActivation.isActive) return; // espera um toque valido
      autoDone = true;
      enterFs();
    };
    window.addEventListener('touchend', tryAutoFs, true);
    window.addEventListener('click', tryAutoFs, true);

    /* ============================================================
     *  Toques: analógicos, botões, multi-touch
     * ============================================================ */
    const DEADZONE = 0.06;
    const ST = {};
    CONTROLS.filter(c => c.type === 'stick').forEach(c => { ST[c.id] = { tid: null, cx: 0, cy: 0, travel: 1 }; });
    const touchBtn = new Map();

    const ctlFromEl = el => {
      const n = el && el.closest ? el.closest('.ctl') : null;
      return n ? CTL[n.dataset.id] : null;
    };

    function refreshBtn(c) {
      const on = HOLD[c.id].size > 0;
      input.buttons[c.idx] = on;
      els[c.id].classList.toggle('on', on);
    }

    function stickStart(c, t) {
      const s = ST[c.id];
      if (s.tid !== null) return;
      const el = els[c.id];
      const r = el.getBoundingClientRect();
      const kn = el.firstElementChild.getBoundingClientRect();
      s.tid = t.identifier;
      s.cx = r.left + r.width / 2;
      s.cy = r.top + r.height / 2;
      s.travel = Math.max(1, r.width / 2 - kn.width / 2);
      el.classList.add('on');
      stickMove(c, t);
    }

    function stickMove(c, t) {
      const s = ST[c.id];
      let nx = (t.clientX - s.cx) / s.travel;
      let ny = (t.clientY - s.cy) / s.travel;
      const mag = Math.hypot(nx, ny);
      if (mag > 1) { nx /= mag; ny /= mag; }
      els[c.id].firstElementChild.style.transform =
        `translate3d(${nx * s.travel}px, ${ny * s.travel}px, 0)`;
      const m = Math.min(mag, 1);
      let ox = 0, oy = 0;
      if (m >= DEADZONE) {
        const k = ((m - DEADZONE) / (1 - DEADZONE)) / m;
        ox = clamp(nx * k, -1, 1);
        oy = clamp(ny * k, -1, 1);
      }
      input.axes[c.ax[0]] = ox;
      input.axes[c.ax[1]] = oy;
    }

    function stickEnd(c) {
      const s = ST[c.id];
      s.tid = null;
      input.axes[c.ax[0]] = 0;
      input.axes[c.ax[1]] = 0;
      els[c.id].firstElementChild.style.transform = 'translate3d(0,0,0)';
      els[c.id].classList.remove('on');
    }

    function releaseAll() {
      CONTROLS.forEach(c => {
        if (c.type === 'stick') stickEnd(c);
        else { HOLD[c.id].clear(); refreshBtn(c); }
      });
      touchBtn.clear();
    }

    /* ---------- Modo edição ---------- */
    let selId = null, drag = null;
    const rK = $('rK'), vK = $('vK');

    function selectCtl(id) {
      selId = id;
      CONTROLS.forEach(c => els[c.id].classList.toggle('sel', c.id === id));
      if (id) {
        const k = layoutOf(CTL[id]).k;
        rK.disabled = false; rK.value = Math.round(k * 100); vK.textContent = Math.round(k * 100) + '%';
      } else { rK.disabled = true; vK.textContent = '—'; }
    }
    function dragStart(t, c) {
      selectCtl(c.id);
      const r = els[c.id].getBoundingClientRect();
      drag = { tid: t.identifier, id: c.id,
               ox: t.clientX - (r.left + r.width / 2), oy: t.clientY - (r.top + r.height / 2) };
    }
    function dragMove(t) {
      const R = layer.getBoundingClientRect();
      const l = layoutOf(CTL[drag.id]);
      cfg.layout[drag.id] = {
        x: +clamp((t.clientX - drag.ox - R.left) / R.width * 100, 0, 100).toFixed(2),
        y: +clamp((t.clientY - drag.oy - R.top) / R.height * 100, 0, 100).toFixed(2),
        k: l.k
      };
      applyOne(drag.id);
    }
    rK.addEventListener('input', () => {
      if (!selId) return;
      const k = +rK.value / 100;
      cfg.layout[selId] = { ...layoutOf(CTL[selId]), k };
      vK.textContent = rK.value + '%';
      applyOne(selId); saveCfg();
    });
    function resetLayout() { cfg.layout = {}; applyAll(); selectCtl(null); saveCfg(); }
    $('eReset').addEventListener('click', resetLayout);
    $('bReset').addEventListener('click', resetLayout);
    $('eDone').addEventListener('click', () => { editMode = false; drag = null; selectCtl(null); saveCfg(); refreshUI(); });
    $('bEdit').addEventListener('click', () => {
      releaseAll(); panelOpen = false; editMode = true; selectCtl(null); refreshUI();
    });

    /* ---------- Handlers da camada de controles ---------- */
    layer.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        const c = ctlFromEl(root.elementFromPoint(t.clientX, t.clientY));
        if (!c) continue;
        if (editMode) { if (!drag) dragStart(t, c); continue; }
        if (c.type === 'stick') { stickStart(c, t); continue; }
        HOLD[c.id].add(t.identifier);
        touchBtn.set(t.identifier, c.id);
        refreshBtn(c);
      }
    }, OPTS);

    layer.addEventListener('touchmove', e => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        if (editMode) { if (drag && t.identifier === drag.tid) dragMove(t); continue; }
        let handled = false;
        for (const id in ST) {
          if (ST[id].tid === t.identifier) { stickMove(CTL[id], t); handled = true; break; }
        }
        if (handled) continue;
        const cur = touchBtn.get(t.identifier);
        if (cur && CTL[cur].g) {
          const nc = ctlFromEl(root.elementFromPoint(t.clientX, t.clientY));
          if (nc && nc.type !== 'stick' && nc.id !== cur && nc.g === CTL[cur].g) {
            HOLD[cur].delete(t.identifier); refreshBtn(CTL[cur]);
            HOLD[nc.id].add(t.identifier); touchBtn.set(t.identifier, nc.id); refreshBtn(nc);
          }
        }
      }
    }, OPTS);

    function onEnd(e) {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        if (editMode) {
          if (drag && t.identifier === drag.tid) { drag = null; saveCfg(); }
          continue;
        }
        for (const id in ST) if (ST[id].tid === t.identifier) stickEnd(CTL[id]);
        const bid = touchBtn.get(t.identifier);
        if (bid) {
          HOLD[bid].delete(t.identifier);
          touchBtn.delete(t.identifier);
          refreshBtn(CTL[bid]);
        }
      }
    }
    layer.addEventListener('touchend', onEnd, OPTS);
    layer.addEventListener('touchcancel', onEnd, OPTS);

    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

    /* ============================================================
     *  Teclado virtual
     * ============================================================ */
    const KB = {
      abc: [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l','ç'],
        ['SHIFT','z','x','c','v','b','n','m','BKSP'],
        ['SYM','TAB','@','SPACE','.','-','ENTER','HIDE']
      ],
      sym: [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['@','#','$','%','&','*','(',')','"',"'"],
        ['!','?',':',';','/','\\','_','=','+','~'],
        ['<','>','[',']','{','}','|','^','BKSP'],
        ['ABC','TAB',',','SPACE','.','-','ENTER','HIDE']
      ]
    };
    const SPECIAL = {
      SHIFT: { t: '⇧', c: 'w15' }, BKSP: { t: '⌫', c: 'w15' }, SYM: { t: '?123', c: 'w15' },
      ABC: { t: 'ABC', c: 'w15' }, TAB: { t: 'Tab', c: 'w15' }, SPACE: { t: '', c: 'w5' },
      ENTER: { t: '↵', c: 'w15' }, HIDE: { t: '⌄', c: '' }
    };
    const kb = { shift: false };
    const letterKeys = [];

    for (const name of ['abc', 'sym']) {
      const L = document.createElement('div');
      L.className = 'klayer ' + name;
      for (const row of KB[name]) {
        const R = document.createElement('div');
        R.className = 'krow';
        for (const k of row) {
          const K = document.createElement('div');
          K.dataset.k = k;
          const sp = SPECIAL[k];
          K.className = 'key' + (sp && sp.c ? ' ' + sp.c : '');
          if (sp) K.textContent = sp.t;
          else { K.textContent = k; if (/^[a-zç]$/.test(k)) letterKeys.push(K); }
          R.appendChild(K);
        }
        L.appendChild(R);
      }
      kbd.appendChild(L);
    }

    function updateShift() {
      letterKeys.forEach(K => { K.textContent = kb.shift ? K.dataset.k.toUpperCase() : K.dataset.k; });
      kbd.querySelectorAll('[data-k="SHIFT"]').forEach(e => e.classList.toggle('act', kb.shift));
    }

    let repT = null, repI = null;
    const stopRepeat = () => { clearTimeout(repT); clearInterval(repI); repT = repI = null; };
    const startRepeat = () => {
      stopRepeat();
      repT = setTimeout(() => { repI = setInterval(() => handleKey('BKSP', true), 55); }, 380);
    };
    const kbTouches = new Map();

    kbd.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();   // mantém o foco no campo de texto
      for (const t of e.changedTouches) {
        const el = root.elementFromPoint(t.clientX, t.clientY);
        const K = el && el.closest ? el.closest('.key') : null;
        if (!K) continue;
        K.classList.add('on');
        const k = K.dataset.k;
        let kk = null;
        switch (k) {
          case 'SHIFT': kb.shift = !kb.shift; updateShift(); break;
          case 'SYM': kbd.dataset.layer = 'sym'; break;
          case 'ABC': kbd.dataset.layer = 'abc'; break;
          case 'HIDE': kbShow = false; refreshUI(); break;
          case 'BKSP': case 'ENTER': case 'TAB': case 'SPACE': kk = k; break;
          default: kk = (kb.shift && kbd.dataset.layer === 'abc') ? k.toUpperCase() : k;
        }
        if (kk !== null) {
          handleKey(kk, true);
          if (kk === 'BKSP') startRepeat();
          if (kb.shift && /^[a-zç]$/.test(k)) { kb.shift = false; updateShift(); }
        }
        kbTouches.set(t.identifier, { K, kk });
      }
    }, OPTS);

    function kbEnd(e) {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        const r = kbTouches.get(t.identifier);
        if (!r) continue;
        kbTouches.delete(t.identifier);
        r.K.classList.remove('on');
        if (r.kk !== null) {
          if (r.kk === 'BKSP') stopRepeat();
          handleKey(r.kk, false);
        }
      }
    }
    kbd.addEventListener('touchend', kbEnd, OPTS);
    kbd.addEventListener('touchcancel', kbEnd, OPTS);

    /* ============================================================
     *  Barra superior e painel de configurações
     * ============================================================ */
    $('bar').addEventListener('mousedown', e => e.preventDefault());   // não tira o foco do campo

    $('bToggle').addEventListener('click', () => {
      cfg.hidden = !cfg.hidden;
      if (cfg.hidden) { releaseAll(); panelOpen = false; kbShow = false; }
      setActive(!cfg.hidden);
      saveCfg(); refreshUI();
    });
    $('bSet').addEventListener('click', () => { panelOpen = !panelOpen; syncPanel(); refreshUI(); });
    $('bKbd').addEventListener('click', () => {
      kbShow = !kbShow; refreshUI();
      if (kbShow && !kbTarget() && !frameOf(document.activeElement)) {
        showToast('Toque em um campo de texto para digitar. Sem campo, as teclas vão como teclado do jogo.');
      }
    });
    $('bClose').addEventListener('click', () => { panelOpen = false; refreshUI(); });

    const rOp = $('rOp'), rSc = $('rSc'), vOp = $('vOp'), vSc = $('vSc');
    const cKbd = $('cKbd'), cSys = $('cSys'), cFs = $('cFs');

    function syncPanel() {
      rOp.value = Math.round(cfg.op * 100); vOp.textContent = Math.round(cfg.op * 100) + '%';
      rSc.value = Math.round(cfg.scale * 100); vSc.textContent = Math.round(cfg.scale * 100) + '%';
      cKbd.checked = !!cfg.kbd; cSys.checked = !!cfg.hideSys; cFs.checked = !!cfg.autoFs;
    }
    rOp.addEventListener('input', () => {
      cfg.op = +rOp.value / 100; vOp.textContent = rOp.value + '%'; saveCfg(); refreshUI();
    });
    rSc.addEventListener('input', () => {
      cfg.scale = +rSc.value / 100; vSc.textContent = rSc.value + '%'; saveCfg(); refreshUI();
    });
    cKbd.addEventListener('change', () => {
      cfg.kbd = cKbd.checked;
      if (!cfg.kbd) { kbShow = false; restoreInputMode(); }
      saveCfg(); refreshUI();
    });
    cSys.addEventListener('change', () => {
      cfg.hideSys = cSys.checked;
      if (!cfg.hideSys) restoreInputMode();
      saveCfg();
    });
    cFs.addEventListener('change', () => { cfg.autoFs = cFs.checked; saveCfg(); });

    syncPanel();
    setActive(!cfg.hidden);
    refreshUI();
  }

  if (IS_TOP) buildUI();
  requestAnimationFrame(loop);
})();