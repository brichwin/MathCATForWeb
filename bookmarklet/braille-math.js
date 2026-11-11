// Braille Math Input — bookmarklet for the Canvas RCE (or any TinyMCE editor).
//
// Type math in UEB or Nemeth braille (six-key chording, ASCII braille, or Unicode
// braille), see a live MathJax 2.7.7 preview and MathCAT speech, and insert the
// MathML at the cursor. If the cursor is in or just after existing math (MathML or
// a Canvas equation image) it is loaded into the input for editing and replaced.
//
// Load from a bookmarklet:
//   javascript:(()=>{import('https://cdn.jsdelivr.net/gh/brichwin/MathCATForWeb@TAG/bookmarklet/braille-math.js').then(m=>m.run()).catch(e=>alert('Braille math input could not load: '+e))})()

import init, { MathCAT } from '../pkg/mathcat_web.js';

export const VERSION = '0.1.0';

const DEFAULTS = {
  // Same build and config the Canvas RCE uses for rendered math.
  mathjaxUrl: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-MML-AM_SVG',
  wasmUrl: new URL('../pkg/mathcat_web_bg.wasm', import.meta.url).href,
};

const CODES = ['UEB', 'Nemeth'];
const STORE_KEY = 'atac_iu_edu_braillemath_config';
const HOST_ID = 'atac-braille-math-host';

// Perkins-style six-key entry, by physical key position (layout independent).
const CHORD_KEYS = { KeyF: 1, KeyD: 2, KeyS: 3, KeyJ: 4, KeyK: 5, KeyL: 6 };

// ---------------------------------------------------------------------------
// MathCAT

let mathcatReady = null;
function ensureMathCAT(opts) {
  if (!mathcatReady) {
    mathcatReady = init({ module_or_path: opts.wasmUrl }).then(() => {
      MathCAT.setRulesDir('Rules');
      MathCAT.setPreference('SpeechStyle', 'ClearSpeak');
      MathCAT.setPreference('Language', 'en');
    });
    mathcatReady.catch(() => { mathcatReady = null; });
  }
  return mathcatReady;
}

function withBrailleCode(code, fn) {
  let saved;
  try { saved = MathCAT.getPreference('BrailleCode'); } catch { /* not set yet */ }
  MathCAT.setPreference('BrailleCode', code);
  try { return fn(); } finally { if (saved) MathCAT.setPreference('BrailleCode', saved); }
}

/** MathML string -> braille in `code`. */
function mathmlToBraille(mathml, code) {
  return withBrailleCode(code, () => { MathCAT.setMathML(mathml); return MathCAT.getBraille(''); });
}

// ---------------------------------------------------------------------------
// Finding the editor and the math near the cursor

function collectEditors(win, out = []) {
  try {
    const tm = win.tinymce;
    if (tm) {
      const list = typeof tm.get === 'function' ? tm.get() : tm.editors;
      const eds = Array.isArray(list) ? list : Object.values(list || {});
      const active = tm.activeEditor;
      if (active && eds.includes(active)) out.unshift(active); // most recently focused first
      for (const ed of eds) if (!out.includes(ed)) out.push(ed);
    }
  } catch { /* cross-origin */ }
  for (let i = 0; i < win.frames.length; i++) {
    try { collectEditors(win.frames[i], out); } catch { /* cross-origin */ }
  }
  return out;
}

function pickEditor() {
  const eds = collectEditors(window).filter(ed => {
    try { return ed.getBody() && !(ed.isHidden && ed.isHidden()); } catch { return false; }
  });
  return eds[0] || null;
}

const isBlankText = s => /^[​﻿]*$/.test(s);
const isMathTarget = n => n && n.nodeType === 1 &&
  (n.localName === 'math' || (n.localName === 'img' && n.classList.contains('equation_image')));

function isSkippable(n) {
  if (!n) return false;
  if (n.nodeType === 3) return isBlankText(n.data);
  if (n.nodeType === 8) return true;
  return n.nodeType === 1 && (n.hasAttribute('data-mce-bogus') || n.getAttribute('data-mce-type') === 'bookmark');
}

const indexOf = n => Array.prototype.indexOf.call(n.parentNode.childNodes, n);

function isBlock(el) {
  const v = el.ownerDocument.defaultView;
  const d = v ? v.getComputedStyle(el).display : 'block';
  return !/^inline/.test(d) && d !== 'contents';
}

/** Last meaningful descendant chain of `n`, stopping at math. */
function lastMath(n) {
  while (n && n.nodeType === 1 && !isMathTarget(n) && !isBlock(n)) {
    let c = n.lastChild;
    while (c && isSkippable(c)) c = c.previousSibling;
    n = c;
  }
  return isMathTarget(n) ? n : null;
}

/** The math immediately left of a collapsed caret, or null. */
function mathLeftOfCaret(rng, body) {
  let c = rng.startContainer, o = rng.startOffset;
  if (c.nodeType === 3) {
    if (!isBlankText(c.data.slice(0, o))) return null;
    o = indexOf(c); c = c.parentNode;
  }
  for (;;) {
    let k = o - 1;
    while (k >= 0 && isSkippable(c.childNodes[k])) k--;
    if (k >= 0) return lastMath(c.childNodes[k]);
    if (c === body || isBlock(c)) return null;
    o = indexOf(c); c = c.parentNode;
  }
}

function findMathNearCaret(ed) {
  const node = ed.selection.getNode();
  if (isMathTarget(node)) return node;
  const inMath = node && node.closest && node.closest('math');
  if (inMath) return inMath;
  const rng = ed.selection.getRng();
  if (!rng) return null;
  if (!rng.collapsed) {
    const sc = rng.startContainer.nodeType === 1 ? rng.startContainer : rng.startContainer.parentNode;
    return sc.closest('math') || null;
  }
  return mathLeftOfCaret(rng, ed.getBody());
}

/** LaTeX for a Canvas equation image (data attribute, src path, or alt text). */
function equationImageLatex(img) {
  const data = img.getAttribute('data-equation-content');
  if (data) return data;
  const src = img.getAttribute('src') || '';
  try {
    const p = new URL(src, 'http://localhost').pathname.split('/equation_images/')[1];
    if (p) return decodeURIComponent(decodeURIComponent(p));
  } catch { /* ignore */ }
  const alt = img.getAttribute('alt') || '';
  return alt.replace(/^LaTeX:\s*/, '') || null;
}

function cleanMathML(mathEl) {
  const clone = mathEl.cloneNode(true);
  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) if (a.name.startsWith('data-mce')) el.removeAttribute(a.name);
  }
  return clone.outerHTML;
}

/** Braille for an existing math node, in `code`. Throws if MathCAT can't read it. */
function existingMathToBraille(node, code) {
  if (node.localName === 'math') return mathmlToBraille(cleanMathML(node), code);
  const mml = node.getAttribute('data-mathml');
  if (mml) return mathmlToBraille(mml, code);
  const latex = equationImageLatex(node);
  if (!latex) throw new Error('This equation image has no LaTeX to read.');
  return MathCAT.translateBraille(latex, 'LaTeX', code);
}

// ---------------------------------------------------------------------------
// Settings

function loadConfig() {
  const def = { code: 'UEB', chord: true, echo: true, speak: true, block: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { return def; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------------------
// Preview iframe (isolated MathJax 2.7.7, so the page's own MathJax isn't touched)

function createPreview(iframe, mathjaxUrl) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  iframe.srcdoc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<style>html,body{margin:0;padding:.5rem;font-size:24px;background:#fff;color:#000;overflow:hidden}#m{min-height:1.5em}</style>
<script>window.MathJax={skipStartupTypeset:true,messageStyle:'none',showMathMenu:false,menuSettings:{zoom:'None'}};</script>
<script src="${esc(mathjaxUrl)}"></script></head><body><div id="m"></div></body></html>`;

  let mj = null, pending = null, fallback = false;
  const loaded = new Promise(resolve => {
    iframe.addEventListener('load', () => {
      const w = iframe.contentWindow;
      const timer = setTimeout(() => { fallback = true; resolve(); }, 10000);
      const poll = setInterval(() => {
        if (w.MathJax && w.MathJax.Hub && w.MathJax.Hub.Register) {
          clearInterval(poll);
          w.MathJax.Hub.Register.StartupHook('End', () => { clearTimeout(timer); mj = w.MathJax; resolve(); });
        }
      }, 50);
    }, { once: true });
  });

  const fit = () => {
    const d = iframe.isConnected && iframe.contentDocument;
    if (d && d.body) iframe.style.height = Math.max(60, d.body.scrollHeight) + 'px';
  };

  return {
    get usesMathJax() { return !!mj && !fallback; },
    async render(mathml) {
      pending = mathml;
      await loaded;
      if (pending !== mathml || !iframe.isConnected || !iframe.contentDocument) return; // superseded or closed
      const box = iframe.contentDocument.getElementById('m');
      box.innerHTML = mathml;              // native MathML if MathJax didn't load
      if (mj) mj.Hub.Queue(['Typeset', mj.Hub, box], fit); else fit();
    },
  };
}

// ---------------------------------------------------------------------------
// Dialog

const CSS = `
:host { all: initial; }
dialog { font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a;
  background: #fff; border: 1px solid #666; border-radius: 8px; padding: 1rem 1.25rem; width: min(46rem, 92vw);
  box-shadow: 0 8px 32px rgba(0,0,0,.35); }
dialog::backdrop { background: rgba(0,0,0,.35); }
h2 { font-size: 1.25rem; margin: 0 0 .25rem; }
.sub { margin: 0 0 .75rem; color: #444; }
fieldset { border: 0; padding: 0; margin: 0 0 .5rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
legend { font-weight: 600; float: left; margin-right: .5rem; }
label { cursor: pointer; }
.field-label { display: block; font-weight: 600; margin: .5rem 0 .25rem; }
textarea { box-sizing: border-box; width: 100%; font-size: 1.75rem; line-height: 1.3; padding: .35rem .5rem;
  border: 2px solid #555; border-radius: 4px; resize: vertical; font-family: "Apple Braille", "Segoe UI Symbol", system-ui, sans-serif; }
textarea:focus, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid #990000; outline-offset: 2px; }
.hint { font-size: .875rem; color: #444; margin: .25rem 0 .5rem; }
.chord-on .chord-badge { display: inline-block; }
.chord-badge { display: none; background: #990000; color: #fff; border-radius: 3px; padding: 0 .4rem; font-size: .8rem; margin-left: .5rem; }
.row { display: flex; gap: 1.25rem; flex-wrap: wrap; margin: .25rem 0; }
.echo { font-size: 1.4rem; min-height: 1.4em; word-break: break-all; }
iframe { width: 100%; height: 70px; border: 1px solid #bbb; border-radius: 4px; background: #fff; display: block; }
.out-label { font-weight: 600; margin: .6rem 0 .2rem; }
.speech { background: #f4f4f4; padding: .35rem .5rem; border-radius: 4px; min-height: 1.4em; }
pre { white-space: pre-wrap; word-break: break-all; background: #f4f4f4; padding: .5rem; font-size: .8rem; margin: .25rem 0; }
.err { color: #a00; font-weight: 600; min-height: 1.2em; margin: .4rem 0; }
.buttons { display: flex; gap: .75rem; justify-content: flex-end; margin-top: .75rem; }
button { font: inherit; padding: .4rem 1rem; border-radius: 4px; border: 1px solid #555; background: #f2f2f2; cursor: pointer; }
button.primary { background: #990000; border-color: #990000; color: #fff; }
button:disabled { opacity: .5; cursor: not-allowed; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.foot { font-size: .75rem; color: #666; margin-top: .5rem; }
`;

const HTML = `
<dialog aria-labelledby="bm-title" aria-describedby="bm-sub">
  <h2 id="bm-title">Braille math input</h2>
  <p class="sub" id="bm-sub"></p>
  <fieldset>
    <legend>Braille code</legend>
    <label><input type="radio" name="bm-code" value="UEB"> UEB</label>
    <label><input type="radio" name="bm-code" value="Nemeth"> Nemeth</label>
  </fieldset>
  <div class="row">
    <label><input type="checkbox" id="bm-chord"> Six-key entry</label>
    <label><input type="checkbox" id="bm-echo"> Announce dots</label>
    <label><input type="checkbox" id="bm-speak"> Announce speech after a pause</label>
  </div>
  <label class="field-label" for="bm-input">Math in braille<span class="chord-badge" aria-hidden="true">six-key</span></label>
  <textarea id="bm-input" rows="2" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="bm-hint"></textarea>
  <p class="hint" id="bm-hint"></p>
  <div class="out-label" id="bm-echo-label">As braille</div>
  <div class="echo" id="bm-uni" aria-labelledby="bm-echo-label"></div>
  <div class="out-label">Preview</div>
  <iframe id="bm-preview" title="Rendered math preview"></iframe>
  <div class="out-label" id="bm-speech-label">Speech</div>
  <div class="speech" id="bm-speech" aria-labelledby="bm-speech-label"></div>
  <details><summary>MathML</summary><pre id="bm-mml"></pre></details>
  <div class="err" id="bm-err" role="alert"></div>
  <label><input type="checkbox" id="bm-block"> Display math (block)</label>
  <div class="buttons">
    <button type="button" id="bm-cancel">Cancel</button>
    <button type="button" id="bm-insert" class="primary">Insert</button>
  </div>
  <div class="sr-only" role="status" aria-live="polite" id="bm-status"></div>
  <p class="foot">MathCAT <span id="bm-ver"></span> · Braille Math Input ${VERSION}</p>
</dialog>`;

function dotsOf(cell) {
  const bits = cell.codePointAt(0) - 0x2800;
  const dots = [];
  for (let i = 0; i < 8; i++) if (bits & (1 << i)) dots.push(i + 1);
  return dots;
}
const describeCell = cell => {
  const d = dotsOf(cell);
  return d.length ? (d.length === 1 ? 'dot ' : 'dots ') + d.join(' ') : 'space';
};

/**
 * Open the dialog. Options: { mathjaxUrl, wasmUrl, editor }.
 */
export async function run(options = {}) {
  const opts = { ...DEFAULTS, ...options };

  const existing = document.getElementById(HOST_ID);
  if (existing) { existing.shadowRoot.querySelector('#bm-input').focus(); return; }

  const ed = opts.editor || pickEditor();
  if (!ed) {
    alert('Braille math input: no rich content editor found on this page. Click in the editor first, then run the bookmarklet.');
    return;
  }

  // Remember where the cursor was before focus moves to the dialog.
  const savedRng = ed.selection.getRng() ? ed.selection.getRng().cloneRange() : null;
  const target = findMathNearCaret(ed);

  const cfg = loadConfig();
  if (!CODES.includes(cfg.code)) cfg.code = 'UEB';

  // ---- build UI
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>${HTML}`;
  document.body.appendChild(host);
  const $ = sel => root.querySelector(sel);
  const dlg = $('dialog'), input = $('#bm-input'), status = $('#bm-status');
  const err = $('#bm-err'), insertBtn = $('#bm-insert');

  const say = msg => { status.textContent = ''; setTimeout(() => { status.textContent = msg; }, 30); };

  $('#bm-sub').textContent = 'Loading MathCAT…';
  root.querySelectorAll('input[name=bm-code]').forEach(r => { r.checked = r.value === cfg.code; });
  $('#bm-chord').checked = cfg.chord;
  $('#bm-echo').checked = cfg.echo;
  $('#bm-speak').checked = cfg.speak;
  $('#bm-block').checked = cfg.block;
  insertBtn.disabled = true;

  const preview = createPreview($('#bm-preview'), opts.mathjaxUrl);

  let closed = false;
  const close = (restoreFocus = true) => {
    if (closed) return;
    closed = true;
    try { dlg.close(); } catch { /* already closed */ }
    host.remove();
    if (restoreFocus) {
      try { ed.focus(); if (savedRng) ed.selection.setRng(savedRng); } catch { /* editor gone */ }
    }
  };
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  $('#bm-cancel').addEventListener('click', () => close());

  const updateHint = () => {
    const chord = $('#bm-chord').checked;
    root.querySelector('.field-label').classList.toggle('chord-on', chord);
    $('#bm-hint').textContent = chord
      ? 'Six-key entry is on: F D S J K L are dots 1 2 3 4 5 6, Space is a blank cell. Unicode braille from a braille display still works. Enter inserts, Escape cancels.'
      : 'Type ASCII braille (for example ?1/2#) or Unicode braille. Enter inserts, Escape cancels.';
  };
  updateHint();

  dlg.showModal();
  input.focus();

  try {
    await ensureMathCAT(opts);
  } catch (e) {
    $('#bm-sub').textContent = '';
    err.textContent = 'Could not load MathCAT: ' + e;
    return;
  }
  $('#bm-ver').textContent = MathCAT.getVersion();

  // ---- existing math -> braille
  let replaceNode = null;
  if (target) {
    try {
      input.value = existingMathToBraille(target, cfg.code);
      replaceNode = target;
      $('#bm-sub').textContent = target.localName === 'img'
        ? 'Editing the equation image next to the cursor. It will be replaced with MathML.'
        : 'Editing the math next to the cursor.';
      insertBtn.textContent = 'Replace';
      if (target.localName === 'math' && target.getAttribute('display') === 'block') $('#bm-block').checked = true;
    } catch (e) {
      $('#bm-sub').textContent = 'New math at the cursor. (The math next to the cursor could not be read, so it will be left alone.)';
    }
  } else {
    $('#bm-sub').textContent = 'New math will be inserted at the cursor.';
  }
  input.setSelectionRange(input.value.length, input.value.length);

  const code = () => root.querySelector('input[name=bm-code]:checked').value;

  // ---- live update
  let currentMathML = '';
  let speakTimer = 0;
  const update = () => {
    const text = input.value;
    clearTimeout(speakTimer);
    err.textContent = '';
    if (!text.trim()) {
      currentMathML = '';
      $('#bm-uni').textContent = '';
      $('#bm-speech').textContent = '';
      $('#bm-mml').textContent = '';
      preview.render('');
      insertBtn.disabled = true;
      return;
    }
    const c = code();
    $('#bm-uni').textContent = MathCAT.normalizeBrailleInput(text, c);
    try {
      currentMathML = MathCAT.brailleToMathML(text, c);
      MathCAT.setMathMLFromBraille(text, c);
      const speech = MathCAT.getSpokenText();
      $('#bm-speech').textContent = speech;
      $('#bm-mml').textContent = currentMathML;
      preview.render(currentMathML);
      insertBtn.disabled = false;
      if ($('#bm-speak').checked) speakTimer = setTimeout(() => say(speech), 1200);
    } catch (e) {
      currentMathML = '';
      insertBtn.disabled = true;
      err.textContent = String(e).replace(/^Error:\s*/, '');
    }
  };
  input.addEventListener('input', update);
  update();

  // ---- code switch: carry the expression over to the new code
  let lastCode = code();
  root.querySelectorAll('input[name=bm-code]').forEach(r => r.addEventListener('change', () => {
    const c = code();
    if (input.value.trim() && currentMathML) {
      try { input.value = MathCAT.translateBraille(input.value, lastCode, c); } catch { /* keep text */ }
    }
    lastCode = c;
    cfg.code = c; saveConfig(cfg);
    update();
    say(`${c}`);
  }));

  for (const id of ['chord', 'echo', 'speak', 'block']) {
    $('#bm-' + id).addEventListener('change', e => {
      cfg[id] = e.target.checked; saveConfig(cfg);
      if (id === 'chord') { updateHint(); say(cfg.chord ? 'Six-key entry on' : 'Six-key entry off'); }
    });
  }

  // ---- six-key chording
  const down = new Set();
  let chordDots = 0, chordSpace = false;
  const insertText = s => {
    input.setRangeText(s, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!insertBtn.disabled) insertBtn.click();
      return;
    }
    if (!$('#bm-chord').checked || e.ctrlKey || e.metaKey || e.altKey) return;
    // Text injected by a screen reader / braille display has no physical key code: let it through.
    const physical = /^(Key[A-Z]|Digit\d|Space|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(e.code);
    if (!physical) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code in CHORD_KEYS || e.code === 'Space') {
      down.add(e.code);
      if (e.code === 'Space') chordSpace = true; else chordDots |= 1 << (CHORD_KEYS[e.code] - 1);
    }
  });
  input.addEventListener('keyup', e => {
    if (!down.has(e.code)) return;
    e.preventDefault();
    down.delete(e.code);
    if (down.size) return;
    if (chordDots || chordSpace) {
      const cell = String.fromCodePoint(0x2800 + chordDots);  // space-only chord = blank cell
      insertText(cell);
      if ($('#bm-echo').checked) say(describeCell(cell));
    }
    chordDots = 0; chordSpace = false;
  });
  input.addEventListener('blur', () => { down.clear(); chordDots = 0; chordSpace = false; });

  // ---- insert / replace
  insertBtn.addEventListener('click', () => {
    if (!currentMathML) return;
    let mathml = currentMathML;
    if ($('#bm-block').checked) mathml = mathml.replace(/^<math\b/, '<math display="block"');
    const body = ed.getBody();
    const before = body.querySelectorAll('math').length;
    try {
      ed.focus();
      ed.undoManager.transact(() => {
        if (replaceNode && replaceNode.isConnected) ed.selection.select(replaceNode);
        else if (savedRng) ed.selection.setRng(savedRng);
        ed.insertContent(mathml);
      });
    } catch (e) {
      err.textContent = 'Could not insert into the editor: ' + e;
      return;
    }
    const after = body.querySelectorAll('math').length;
    const expected = before + (replaceNode && replaceNode.localName === 'math' ? 0 : 1);
    close(false);
    if (after < expected) {
      alert('Braille math input: the editor removed the MathML when it was inserted. This editor may not allow MathML.');
    }
  });
}
