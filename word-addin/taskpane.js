// Braille Math Input for Word — task pane logic.
// Type UEB or Nemeth braille, preview it, and insert it into Word as a native equation (OMML).
// Load an existing Word equation back into braille, edit it, and replace it.
//
// Dependencies: Office.js (from Microsoft, loaded by taskpane.html) and the MathCATForWeb
// WebAssembly build in ../pkg. The MathML <-> OMML conversion is our own code.

import init, { MathCAT } from '../pkg/mathcat_web.js';
import { mathmlToOmml } from './mathml2omml.js';
import { ommlToMathml } from './omml2mathml.js';
import { packageForOmml, findEquations, replaceEquation } from './ooxml.js';

export const VERSION = '0.1.1';
const STORE_KEY = 'atac_iu_edu_braillemath_word';
const CHORD_KEYS = { KeyF: 1, KeyD: 2, KeyS: 3, KeyJ: 4, KeyK: 5, KeyL: 6 };

// ---------------------------------------------------------------- Word access

/** Short description of an Office.js error, including which API call failed when Word says. */
export function describeError(e) {
  if (!e) return 'unknown error';
  const loc = e.debugInfo && e.debugInfo.errorLocation;
  const code = e.code || e.name || '';
  const msg = e.message && e.message !== code ? e.message : '';
  return [code, msg].filter(Boolean).join(': ') + (loc ? ` (at ${loc})` : '') || String(e);
}

/**
 * Get the OOXML of a range, or null if Word refuses. Each attempt gets a fresh selection
 * object, because objects from a failed batch can't be reused.
 */
async function ooxmlOf(context, label, makeRange, problems) {
  try {
    const range = makeRange(context.document.getSelection());
    const xml = range.getOoxml();
    await context.sync();
    return { range, xml: xml.value };
  } catch (e) {
    problems.push(`${label}: ${describeError(e)}`);
    return null;
  }
}

// Places to look for the equation, in order. Word for Mac (and possibly others) can refuse
// getOoxml() on a selection that is inside an equation, so fall back to the paragraph.
const LOOK_IN = [
  ['selection', sel => sel],
  ['paragraph', sel => sel.paragraphs.getFirst()],
  ['paragraph content', sel => sel.paragraphs.getFirst().getRange('Content')],
  ['whole paragraph', sel => sel.paragraphs.getFirst().getRange('Whole')],
];

/**
 * Find the equation to edit: one in the selection, or else the only one in the cursor's paragraph.
 * Must be called inside Word.run. Returns { range, doc, equation, scope } or { count, scope },
 * plus `problems`: the Word calls that failed along the way.
 */
async function locateEquation(context) {
  const problems = [];
  for (const [label, make] of LOOK_IN) {
    const got = await ooxmlOf(context, label, make, problems);
    if (!got) continue;
    let found;
    try { found = findEquations(got.xml); } catch (e) { problems.push(`${label}: ${e.message}`); continue; }
    if (found.equations.length === 1) return { range: got.range, doc: found.doc, equation: found.equations[0], scope: label, problems };
    if (found.equations.length > 1) return { count: found.equations.length, scope: label, problems };
    if (label !== 'selection') return { count: 0, scope: label, problems };   // the paragraph has none
  }
  const err = new Error('Word would not give the add-in the text around the cursor. ' + problems.join('; '));
  err.problems = problems;
  throw err;
}

const word = {
  /** The equation at the cursor as { mathml, display, warnings } or { count } if there isn't exactly one. */
  async readEquation() {
    return Word.run(async context => {
      const found = await locateEquation(context);
      if (!found.equation) return { count: found.count, scope: found.scope };
      const { mathml, warnings } = ommlToMathml(found.equation);
      return { mathml, warnings, display: found.equation.localName === 'oMathPara', scope: found.scope };
    });
  },
  /** Insert an equation after the selection (at the cursor if nothing is selected). */
  async insert(omml) {
    return Word.run(async context => {
      const pkg = packageForOmml(omml);
      const problems = [];
      const attempts = [
        ['after the selection', sel => sel.getRange('End').insertOoxml(pkg, 'Replace')],
        ['end of the paragraph', sel => sel.paragraphs.getFirst().insertOoxml(pkg, 'End')],
      ];
      for (const [label, run] of attempts) {
        try {
          run(context.document.getSelection());
          await context.sync();
          return;
        } catch (e) {
          problems.push(`${label}: ${describeError(e)}`);
        }
      }
      const err = new Error('Word would not insert at the cursor. ' + problems.join('; '));
      err.problems = problems;
      throw err;
    });
  },
  /** Replace the equation at the cursor. Returns false if there isn't exactly one there any more. */
  async replace(omml) {
    return Word.run(async context => {
      const found = await locateEquation(context);
      if (!found.equation) return false;
      found.range.insertOoxml(replaceEquation(found.doc, found.equation, omml), 'Replace');
      await context.sync();
      return true;
    });
  },
};

// ---------------------------------------------------------------- MathCAT

function braille(mathml, code) {
  MathCAT.setPreference('BrailleCode', code);
  MathCAT.setMathML(mathml);
  return MathCAT.getBraille('');
}

function speechOf(mathml) {
  MathCAT.setMathML(mathml);
  return MathCAT.getSpokenText();
}

/**
 * Check that MathCAT reads `brailleText` back as the same math as `mathml`. MathCAT's braille
 * reader is an early release, and some braille it writes is read back differently; this stops
 * an unchanged "Replace" from silently changing the equation. Returns null or a warning.
 */
function roundTripWarning(mathml, brailleText, code) {
  try {
    const original = speechOf(mathml);
    const readBack = speechOf(MathCAT.brailleToMathML(brailleText, code));
    if (original === readBack) return null;
    return `Check before replacing: in ${code}, MathCAT reads this braille as “${readBack}”, but the equation in the document reads as “${original}”.`;
  } catch (e) {
    return `Check before replacing: MathCAT could not read this ${code} braille back (${e}).`;
  }
}

// ---------------------------------------------------------------- UI

const HTML = `
<main class="bm">
  <h1>Braille Math Input</h1>
  <p class="status" id="bm-mode">Loading MathCAT…</p>

  <fieldset class="codes">
    <legend>Braille code</legend>
    <label><input type="radio" name="bm-code" value="UEB"> UEB</label>
    <label><input type="radio" name="bm-code" value="Nemeth"> Nemeth</label>
  </fieldset>

  <label class="field-label" for="bm-input">Math in braille</label>
  <textarea id="bm-input" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="bm-hint"></textarea>
  <p class="hint" id="bm-hint"></p>

  <div class="buttons">
    <button type="button" id="bm-primary" class="primary">Insert</button>
    <button type="button" id="bm-load">Edit equation at cursor</button>
    <button type="button" id="bm-new" hidden>Start new equation</button>
  </div>
  <div class="err" id="bm-err" role="alert"></div>
  <p class="note" id="bm-cursor"></p>

  <h2 class="out-label" id="bm-speech-label">Speech</h2>
  <p class="speech" id="bm-speech"></p>
  <h2 class="out-label">Preview</h2>
  <div class="preview" id="bm-preview" aria-hidden="true"></div>
  <h2 class="out-label" id="bm-echo-label">As braille</h2>
  <p class="echo" id="bm-uni"></p>

  <details>
    <summary>Options</summary>
    <label><input type="checkbox" id="bm-chord"> Six-key entry (F D S J K L)</label>
    <label><input type="checkbox" id="bm-echo"> Announce dots</label>
    <label><input type="checkbox" id="bm-speak"> Announce speech after a pause</label>
    <label><input type="checkbox" id="bm-block"> Display equation (own line)</label>
  </details>
  <details>
    <summary>MathML</summary>
    <pre id="bm-mml"></pre>
  </details>

  <div class="sr-only" role="status" aria-live="polite" id="bm-status"></div>
  <p class="foot">MathCAT <span id="bm-ver"></span> · Braille Math Input for Word ${VERSION}</p>
</main>`;

function loadConfig() {
  const def = { code: 'UEB', chord: true, echo: true, speak: true, block: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { return def; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ }
}

function describeCell(cell) {
  const bits = cell.codePointAt(0) - 0x2800;
  const dots = [];
  for (let i = 0; i < 8; i++) if (bits & (1 << i)) dots.push(i + 1);
  return dots.length ? (dots.length === 1 ? 'dot ' : 'dots ') + dots.join(' ') : 'space';
}

/**
 * Build the task pane in `root` and wire it to Word.
 * @param {Element} root
 * @param {{wasmUrl?: string, wordApi?: object, watchSelection?: boolean}} [opts]
 */
export async function start(root, opts = {}) {
  const api = opts.wordApi || word;
  root.innerHTML = HTML;
  const $ = sel => root.querySelector(sel);
  const input = $('#bm-input'), primary = $('#bm-primary'), err = $('#bm-err'), status = $('#bm-status');
  const say = msg => { status.textContent = ''; setTimeout(() => { status.textContent = msg; }, 30); };

  const cfg = loadConfig();
  root.querySelectorAll('input[name=bm-code]').forEach(r => { r.checked = r.value === cfg.code; });
  for (const id of ['chord', 'echo', 'speak', 'block']) $('#bm-' + id).checked = cfg[id];
  const code = () => root.querySelector('input[name=bm-code]:checked').value;

  const updateHint = () => {
    $('#bm-hint').textContent = $('#bm-chord').checked
      ? 'Six-key entry: F D S J K L are dots 1 2 3 4 5 6, Space is a blank cell. Enter inserts.'
      : 'Type ASCII braille (for example ?1/2#) or Unicode braille. Enter inserts.';
  };
  updateHint();
  primary.disabled = true;

  try {
    await init(opts.wasmUrl ? { module_or_path: opts.wasmUrl } : undefined);
    MathCAT.setRulesDir('Rules');
    MathCAT.setPreference('SpeechStyle', 'ClearSpeak');
    MathCAT.setPreference('Language', 'en');
  } catch (e) {
    $('#bm-mode').textContent = '';
    err.textContent = 'Could not load MathCAT: ' + e;
    return;
  }
  $('#bm-ver').textContent = MathCAT.getVersion();

  // ---- mode: new equation or editing one from the document
  let editing = false;
  let loaded = null;            // { mathml, text } of the equation loaded from the document
  const checkLoaded = () => {
    if (!loaded || input.value !== loaded.text) return;
    const w = roundTripWarning(loaded.mathml, input.value, code());
    if (w) err.textContent = w;
  };
  const setMode = isEditing => {
    editing = isEditing;
    $('#bm-mode').textContent = isEditing
      ? 'Editing the equation at the cursor. Replace puts your changes back in the document.'
      : 'New equation. Insert puts it at the cursor in the document.';
    primary.textContent = isEditing ? 'Replace' : 'Insert';
    $('#bm-new').hidden = !isEditing;
    if (!isEditing) loaded = null;
  };
  setMode(false);

  // ---- live update
  let currentMathML = '';
  let speakTimer = 0;
  const update = () => {
    const text = input.value;
    clearTimeout(speakTimer);
    err.textContent = '';
    if (!text.trim()) {
      currentMathML = '';
      for (const id of ['#bm-uni', '#bm-speech', '#bm-mml', '#bm-preview']) $(id).textContent = '';
      primary.disabled = true;
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
      $('#bm-preview').innerHTML = currentMathML.replace(/^<math\b/, '<math display="block"');
      primary.disabled = false;
      if ($('#bm-speak').checked) speakTimer = setTimeout(() => say(speech), 1200);
    } catch (e) {
      currentMathML = '';
      primary.disabled = true;
      err.textContent = String(e).replace(/^Error:\s*/, '');
    }
  };
  input.addEventListener('input', update);

  // ---- code switch carries the expression over
  let lastCode = code();
  root.querySelectorAll('input[name=bm-code]').forEach(r => r.addEventListener('change', () => {
    const c = code();
    if (loaded && input.value === loaded.text) {
      // Untouched equation from the document: braille it again from the original.
      input.value = braille(loaded.mathml, c);
      loaded.text = input.value;
    } else if (input.value.trim() && currentMathML) {
      try { input.value = MathCAT.translateBraille(input.value, lastCode, c); } catch { /* keep text */ }
    }
    lastCode = c; cfg.code = c; saveConfig(cfg);
    update();
    checkLoaded();
    say(c);
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
      if (!primary.disabled) primary.click();
      return;
    }
    if (!$('#bm-chord').checked || e.ctrlKey || e.metaKey || e.altKey) return;
    const physical = /^(Key[A-Z]|Digit\d|Space|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(e.code);
    if (!physical) return;        // text injected by a screen reader / braille display
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
      const cell = String.fromCodePoint(0x2800 + chordDots);
      insertText(cell);
      if ($('#bm-echo').checked) say(describeCell(cell));
    }
    chordDots = 0; chordSpace = false;
  });
  input.addEventListener('blur', () => { down.clear(); chordDots = 0; chordSpace = false; });

  // ---- load the equation at the cursor
  const loadEquation = async () => {
    err.textContent = '';
    let found;
    try { found = await api.readEquation(); } catch (e) { err.textContent = 'Could not read the document. ' + (e.problems ? e.message : describeError(e)); return; }
    if (!found.mathml) {
      err.textContent = found.count > 1
        ? `This paragraph has ${found.count} equations. Select the one to edit (for example with Shift+Right Arrow), then choose Edit equation at cursor.`
        : 'There is no equation at the cursor. Put the cursor in an equation, or select it, and try again.';
      return;
    }
    try {
      input.value = braille(found.mathml, code());
    } catch (e) {
      err.textContent = 'MathCAT could not read this equation: ' + e;
      return;
    }
    $('#bm-block').checked = found.display;
    setMode(true);
    loaded = { mathml: found.mathml, text: input.value, display: found.display };
    update();
    checkLoaded();
    if (found.warnings && found.warnings.length) $('#bm-cursor').textContent = 'Note: ' + found.warnings.join(' ');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    say('Equation loaded for editing.');
  };
  $('#bm-load').addEventListener('click', loadEquation);

  $('#bm-new').addEventListener('click', () => {
    input.value = '';
    $('#bm-cursor').textContent = '';
    setMode(false);
    update();
    input.focus();
    say('New equation.');
  });

  // ---- insert / replace
  primary.addEventListener('click', async () => {
    if (!currentMathML) return;
    if (editing && loaded && input.value === loaded.text && $('#bm-block').checked === loaded.display) {
      err.textContent = 'Nothing has changed, so the equation was left as it is.';
      return;
    }
    // Unedited braille: convert the original equation (only Display changed), not MathCAT's
    // reading of the braille, so nothing else about the equation can change.
    const source = editing && loaded && input.value === loaded.text ? loaded.mathml : currentMathML;
    const { omml, warnings } = mathmlToOmml(source, { display: $('#bm-block').checked });
    try {
      if (editing) {
        const ok = await api.replace(omml);
        if (!ok) {
          err.textContent = 'The equation is no longer at the cursor, so nothing was replaced. Put the cursor back in it, or choose Start new equation and Insert.';
          return;
        }
        say('Equation replaced.');
      } else {
        await api.insert(omml);
        say('Equation inserted.');
      }
    } catch (e) {
      err.textContent = 'Word could not take the equation: ' + (e.problems ? e.message : describeError(e));
      return;
    }
    $('#bm-cursor').textContent = warnings.length ? 'Note: ' + warnings.join(' ') : '';
    input.value = '';
    setMode(false);
    update();
    input.focus();
  });

  // ---- tell the user when the cursor is at an equation
  if (opts.watchSelection !== false && globalThis.Office?.context?.document?.addHandlerAsync) {
    let timer = 0;
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const found = await api.readEquation();
          $('#bm-cursor').textContent = found.mathml
            ? 'The cursor is at an equation. Choose Edit equation at cursor to load it.'
            : found.count > 1 ? `The cursor's paragraph has ${found.count} equations; select one to edit it.` : '';
        } catch { /* ignore */ }
      }, 500);
    });
  }

  input.focus();
  return { MathCAT };
}
