// MathML -> OMML (Office Math Markup Language), with no dependencies.
// Uses only the browser's DOMParser / XMLSerializer, which Office add-in webviews provide.
//
// Written for the presentation MathML that MathCAT's braille/LaTeX parser produces, plus the
// common elements other tools emit. Constructs with no OMML equivalent are converted as closely
// as possible and listed in `warnings`.

export const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

// Large operators that become m:nary.
const NARY = new Set([...'∑∏∐∫∬∭∮∯∰∱∲∳⋀⋁⋂⋃⨀⨁⨂⨄⨆⨌']);
// Function names that become m:func when followed by an argument.
const FUNCTIONS = new Set(('sin cos tan cot sec csc sinh cosh tanh coth sech csch arcsin arccos arctan ' +
  'arccot arcsec arccsc log ln lg exp det dim ker deg arg gcd lcm hom sgn tr Pr max min sup inf lim liminf limsup').split(' '));
// Opening fence -> closing fence.
const FENCES = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '〈': '〉', '⌊': '⌋', '⌈': '⌉', '|': '|', '‖': '‖', '⟦': '⟧' };
const CLOSERS = new Set(Object.values(FENCES));
// Overscripts that are accents (spacing form -> combining form used by m:acc).
const ACCENTS = {
  '^': '̂', 'ˆ': '̂', '̂': '̂', '~': '̃', '˜': '̃', '̃': '̃',
  '→': '⃗', '⃗': '⃗', '←': '⃖', '↔': '⃡', '˙': '̇', '̇': '̇',
  '¨': '̈', '̈': '̈', '´': '́', '`': '̀', 'ˇ': '̌', '˘': '̆', '̆': '̆',
};
const OVERBARS = new Set(['¯', '‾', '―', '̅', '_', '−', '-', '̄']);
const UNDERBARS = new Set(['_', '̲', '¯', '‾', '―']);
const GROUP_CHARS = new Set(['⏞', '⏟', '⏜', '⏝', '⎴', '⎵', '︷', '︸']);
const INVISIBLE = new Set(['⁡', '⁢', '⁣', '⁤']);

function parseMathML(input) {
  if (typeof input !== 'string') return input;
  // The HTML parser understands MathML, named entities, and markup without an xmlns.
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${input}</body>`, 'text/html');
  const math = doc.querySelector('math');
  if (!math) throw new Error('No <math> element found.');
  return math;
}

const elementChildren = n => Array.from(n.children);
const name = n => n.localName;
const text = n => (n.textContent || '').trim();

/**
 * Convert MathML to OMML.
 * @param {string|Element} input  MathML string or <math> element
 * @param {{display?: boolean}} [opts]  display: force (true) or prevent (false) m:oMathPara
 * @returns {{omml: string, warnings: string[]}}  omml is an <m:oMath> or <m:oMathPara> element
 */
export function mathmlToOmml(input, opts = {}) {
  const math = parseMathML(input);
  const display = opts.display ?? (math.getAttribute('display') === 'block');
  const rootName = display ? 'm:oMathPara' : 'm:oMath';
  const doc = document.implementation.createDocument(M_NS, rootName, null);
  const root = doc.documentElement;
  root.setAttributeNS(XMLNS_NS, 'xmlns:m', M_NS);
  root.setAttributeNS(XMLNS_NS, 'xmlns:w', W_NS);
  const ctx = { doc, warnings: [] };
  const oMath = display ? root.appendChild(doc.createElementNS(M_NS, 'm:oMath')) : root;
  appendAll(oMath, convertList(ctx, elementChildren(math)));
  return { omml: new XMLSerializer().serializeToString(root), warnings: [...new Set(ctx.warnings)] };
}

// ---------------------------------------------------------------- building blocks

function el(ctx, tag, ...kids) {
  const e = ctx.doc.createElementNS(M_NS, 'm:' + tag);
  appendAll(e, kids.flat());
  return e;
}
function prop(ctx, tag, val) {
  const e = ctx.doc.createElementNS(M_NS, 'm:' + tag);
  if (val !== undefined) e.setAttributeNS(M_NS, 'm:val', val);
  return e;
}
function appendAll(parent, kids) {
  for (const k of kids) if (k) parent.appendChild(k);
}

/** A math run. style: undefined (default math italic), 'p' upright, 'b' bold, 'bi', or 'nor' for text. */
function run(ctx, str, style) {
  const r = el(ctx, 'r');
  if (style) {
    const rPr = el(ctx, 'rPr');
    if (style === 'nor') { rPr.appendChild(prop(ctx, 'sty', 'p')); rPr.appendChild(el(ctx, 'nor')); }
    else rPr.appendChild(prop(ctx, 'sty', style));
    r.appendChild(rPr);
  }
  const wrPr = ctx.doc.createElementNS(W_NS, 'w:rPr');
  const fonts = ctx.doc.createElementNS(W_NS, 'w:rFonts');
  fonts.setAttributeNS(W_NS, 'w:ascii', 'Cambria Math');
  fonts.setAttributeNS(W_NS, 'w:hAnsi', 'Cambria Math');
  wrPr.appendChild(fonts);
  r.appendChild(wrPr);
  const t = el(ctx, 't');
  if (/^\s|\s$/.test(str)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.textContent = str;
  r.appendChild(t);
  return r;
}

/** An argument container (m:e, m:num, m:sup, ...) holding the converted node. */
function arg(ctx, tag, node) {
  const a = el(ctx, tag);
  if (node) appendAll(a, convertList(ctx, flatten(node)));
  return a;
}
function argList(ctx, tag, nodes) {
  const a = el(ctx, tag);
  appendAll(a, convertList(ctx, nodes));
  return a;
}

/** mrow-like wrappers contribute their children directly. */
function flatten(node) {
  if (!node) return [];
  const n = name(node);
  if (n === 'mrow' || n === 'mstyle' || n === 'mpadded' || n === 'merror' || n === 'math') {
    return elementChildren(node).flatMap(flatten);
  }
  if (n === 'semantics') return flatten(elementChildren(node)[0]);
  return [node];
}

const isToken = n => n && ['mi', 'mo', 'mn', 'mtext', 'ms'].includes(name(n));
const tokenText = n => (isToken(n) ? text(n) : null);
const isNaryOp = n => n && name(n) === 'mo' && NARY.has(text(n));
const isFunctionName = n => {
  if (!n) return false;
  if ((name(n) === 'mi' || name(n) === 'mo') && FUNCTIONS.has(text(n))) return true;
  return false;
};
/** Base of a scripted element (msub/msup/munder...), or null. */
const scriptBase = n => (n && /^(msub|msup|msubsup|munder|mover|munderover)$/.test(name(n)) ? elementChildren(n)[0] : null);

// ---------------------------------------------------------------- lists (where sequence matters)

/** Convert a sequence of MathML nodes, handling fences, n-ary operators and functions. */
function convertList(ctx, nodes) {
  nodes = nodes.flatMap(flatten).filter(n => !(name(n) === 'mo' && INVISIBLE.has(text(n)) && text(n) !== '⁡'));
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const t = tokenText(n);

    // Fence pairs -> m:d
    if (t && t in FENCES && (name(n) === 'mo' || name(n) === 'mi')) {
      const j = matchingFence(nodes, i);
      if (j > i) {
        out.push(delimiter(ctx, t, tokenText(nodes[j]), nodes.slice(i + 1, j)));
        i = j;
        continue;
      }
    }

    // N-ary operators: the operator (with limits) applies to the next item
    const naryBase = isNaryOp(n) ? n : (isNaryOp(scriptBase(n)) ? scriptBase(n) : null);
    if (naryBase) {
      const [body, used] = nextItem(nodes, i + 1);
      out.push(nary(ctx, n, naryBase, body));
      i += used;
      continue;
    }

    // Function application: sin x, log_2 8, lim_{x->0} f(x)
    const fnBase = isFunctionName(n) ? n : (isFunctionName(scriptBase(n)) ? scriptBase(n) : null);
    if (fnBase) {
      let k = i + 1;
      if (nodes[k] && name(nodes[k]) === 'mo' && text(nodes[k]) === '⁡') k++;
      const [body, used] = nextItem(nodes, k);
      if (body.length) {
        const fName = el(ctx, 'fName');
        if (n === fnBase) fName.appendChild(run(ctx, text(n), 'p'));
        else appendAll(fName, [convertNode(ctx, n, { uprightBase: true })]);
        out.push(el(ctx, 'func', fName, argList(ctx, 'e', body)));
        i = k - 1 + used;
        continue;
      }
    }

    if (name(n) === 'mo' && text(n) === '⁡') continue;   // stray function-application mark
    out.push(convertNode(ctx, n));
  }
  return out.flat();
}

/** Index of the fence that closes nodes[i], or -1. */
function matchingFence(nodes, i) {
  const open = tokenText(nodes[i]);
  const close = FENCES[open];
  let depth = 0;
  for (let j = i + 1; j < nodes.length; j++) {
    const t = tokenText(nodes[j]);
    if (t === close && depth === 0) return j;
    if (open !== close) {
      if (t === open) depth++;
      else if (t === close) depth--;
    }
  }
  return -1;
}

/** The next "item" starting at k: a fenced group or a single node. Returns [nodes, count]. */
function nextItem(nodes, k) {
  if (k >= nodes.length) return [[], 0];
  const t = tokenText(nodes[k]);
  if (t && t in FENCES) {
    const j = matchingFence(nodes, k);
    if (j > k) return [nodes.slice(k, j + 1), j - k + 1];
  }
  if (name(nodes[k]) === 'mo' && !isNaryOp(nodes[k])) return [[], 0];   // an operator ends the argument
  return [[nodes[k]], 1];
}

function delimiter(ctx, open, close, inner) {
  const dPr = el(ctx, 'dPr');
  if (open !== '(') dPr.appendChild(prop(ctx, 'begChr', open));
  if (close !== ')') dPr.appendChild(prop(ctx, 'endChr', close));
  const d = el(ctx, 'd');
  if (dPr.childNodes.length) d.appendChild(dPr);
  d.appendChild(argList(ctx, 'e', inner));
  return d;
}

function nary(ctx, n, op, body) {
  const kind = name(n);
  const kids = elementChildren(n);
  let sub = null, sup = null, limLoc = 'undOvr';
  if (kind === 'msub' || kind === 'msup' || kind === 'msubsup') limLoc = 'subSup';
  if (kind === 'msub' || kind === 'munder') sub = kids[1];
  else if (kind === 'msup' || kind === 'mover') sup = kids[1];
  else if (kind === 'msubsup' || kind === 'munderover') { sub = kids[1]; sup = kids[2]; }
  const pr = el(ctx, 'naryPr', prop(ctx, 'chr', text(op)), prop(ctx, 'limLoc', limLoc));
  if (!sub) pr.appendChild(prop(ctx, 'subHide', '1'));
  if (!sup) pr.appendChild(prop(ctx, 'supHide', '1'));
  return el(ctx, 'nary', pr, arg(ctx, 'sub', sub), arg(ctx, 'sup', sup), argList(ctx, 'e', body));
}

// ---------------------------------------------------------------- single nodes

function convertNode(ctx, n, opts = {}) {
  const kids = elementChildren(n);
  switch (name(n)) {
    case 'mi': {
      const t = text(n);
      if (!t) return null;
      const v = n.getAttribute('mathvariant');
      if (v === 'bold') return run(ctx, t, 'b');
      if (v === 'bold-italic') return run(ctx, t, 'bi');
      if (v === 'normal' || opts.uprightBase || [...t].length > 1) return run(ctx, t, 'p');
      return run(ctx, t);
    }
    case 'mn': return text(n) ? run(ctx, text(n)) : null;
    case 'mo': {
      const t = text(n);
      if (!t || INVISIBLE.has(t)) return null;
      return run(ctx, t, /^\p{L}{2,}$/u.test(t) ? 'p' : undefined);
    }
    case 'mtext': return n.textContent ? run(ctx, n.textContent, 'nor') : null;
    case 'ms': return run(ctx, `"${n.textContent}"`, 'nor');
    case 'mspace': return null;
    case 'mrow': case 'mstyle': case 'mpadded': case 'merror': case 'semantics':
      return convertList(ctx, flatten(n));
    case 'mfrac': {
      const f = el(ctx, 'f');
      const lt = n.getAttribute('linethickness');
      const type = n.getAttribute('bevelled') === 'true' ? 'skw' : (lt !== null && parseFloat(lt) === 0 ? 'noBar' : null);
      if (type) f.appendChild(el(ctx, 'fPr', prop(ctx, 'type', type)));
      f.appendChild(arg(ctx, 'num', kids[0]));
      f.appendChild(arg(ctx, 'den', kids[1]));
      return f;
    }
    case 'msqrt':
      return el(ctx, 'rad', el(ctx, 'radPr', prop(ctx, 'degHide', '1')), el(ctx, 'deg'), argList(ctx, 'e', kids));
    case 'mroot':
      return el(ctx, 'rad', arg(ctx, 'deg', kids[1]), arg(ctx, 'e', kids[0]));
    case 'msup':
      return el(ctx, 'sSup', baseArg(ctx, kids[0], opts), arg(ctx, 'sup', kids[1]));
    case 'msub':
      return el(ctx, 'sSub', baseArg(ctx, kids[0], opts), arg(ctx, 'sub', kids[1]));
    case 'msubsup':
      return el(ctx, 'sSubSup', baseArg(ctx, kids[0], opts), arg(ctx, 'sub', kids[1]), arg(ctx, 'sup', kids[2]));
    case 'mover': return over(ctx, n, kids[0], kids[1], opts);
    case 'munder': return under(ctx, n, kids[0], kids[1], opts);
    case 'munderover': {
      // Not an n-ary operator (handled in convertList): limit below, then limit above.
      const lower = el(ctx, 'limLow', baseArg(ctx, kids[0], opts), arg(ctx, 'lim', kids[1]));
      return el(ctx, 'limUpp', el(ctx, 'e', lower), arg(ctx, 'lim', kids[2]));
    }
    case 'mtable': {
      const rows = kids.filter(r => name(r) === 'mtr' || name(r) === 'mlabeledtr');
      const ncols = Math.max(1, ...rows.map(r => elementChildren(r).filter(c => name(c) === 'mtd').length));
      const mPr = el(ctx, 'mPr', el(ctx, 'mcs', el(ctx, 'mc', el(ctx, 'mcPr', prop(ctx, 'count', String(ncols)), prop(ctx, 'mcJc', 'center')))));
      const m = el(ctx, 'm', mPr);
      for (const r of rows) {
        let cells = elementChildren(r).filter(c => name(c) === 'mtd');
        if (name(r) === 'mlabeledtr') { cells = cells.slice(1); ctx.warnings.push('Equation labels were dropped.'); }
        const mr = el(ctx, 'mr');
        for (let c = 0; c < ncols; c++) mr.appendChild(argList(ctx, 'e', cells[c] ? elementChildren(cells[c]) : []));
        m.appendChild(mr);
      }
      return m;
    }
    case 'mphantom':
      return el(ctx, 'phant', el(ctx, 'phantPr', prop(ctx, 'show', '0')), argList(ctx, 'e', kids));
    case 'menclose': {
      const notation = (n.getAttribute('notation') || 'longdiv').split(/\s+/);
      if (!notation.some(x => x === 'box' || x === 'roundedbox')) ctx.warnings.push(`<menclose notation="${notation.join(' ')}"> was converted to a box.`);
      return el(ctx, 'borderBox', argList(ctx, 'e', kids));
    }
    case 'mmultiscripts': return multiscripts(ctx, kids);
    case 'mfenced': {
      const open = n.getAttribute('open') ?? '(';
      const close = n.getAttribute('close') ?? ')';
      return delimiter(ctx, open, close, kids);
    }
    case 'maction': return kids[0] ? convertNode(ctx, kids[0]) : null;
    case 'annotation': case 'annotation-xml': case 'none': case 'mprescripts': return null;
    default:
      ctx.warnings.push(`<${name(n)}> is not supported; its contents were kept.`);
      return convertList(ctx, kids);
  }
}

/** m:e for a script base; multi-letter names (sin, log) stay upright. */
function baseArg(ctx, node, opts) {
  if (node && (name(node) === 'mi' || name(node) === 'mo') && (opts.uprightBase || [...text(node)].length > 1)) {
    return el(ctx, 'e', run(ctx, text(node), 'p'));
  }
  return arg(ctx, 'e', node);
}

function over(ctx, n, base, script, opts) {
  const s = tokenText(script);
  const accent = n.getAttribute('accent') === 'true' || (s !== null && s in ACCENTS);
  if (s !== null && OVERBARS.has(s)) return el(ctx, 'bar', el(ctx, 'barPr', prop(ctx, 'pos', 'top')), arg(ctx, 'e', base));
  if (s !== null && GROUP_CHARS.has(s)) {
    return el(ctx, 'groupChr', el(ctx, 'groupChrPr', prop(ctx, 'chr', s), prop(ctx, 'pos', 'top'), prop(ctx, 'vertJc', 'bot')), arg(ctx, 'e', base));
  }
  if (accent && s !== null) {
    return el(ctx, 'acc', el(ctx, 'accPr', prop(ctx, 'chr', ACCENTS[s] || s)), arg(ctx, 'e', base));
  }
  return el(ctx, 'limUpp', baseArg(ctx, base, opts), arg(ctx, 'lim', script));
}

function under(ctx, n, base, script, opts) {
  const s = tokenText(script);
  if (s !== null && GROUP_CHARS.has(s)) {
    return el(ctx, 'groupChr', el(ctx, 'groupChrPr', prop(ctx, 'chr', s)), arg(ctx, 'e', base));
  }
  if (s !== null && UNDERBARS.has(s)) return el(ctx, 'bar', el(ctx, 'barPr', prop(ctx, 'pos', 'bot')), arg(ctx, 'e', base));
  return el(ctx, 'limLow', baseArg(ctx, base, opts), arg(ctx, 'lim', script));
}

function multiscripts(ctx, kids) {
  const base = kids[0];
  const p = kids.findIndex(k => name(k) === 'mprescripts');
  const post = (p < 0 ? kids.slice(1) : kids.slice(1, p));
  const pre = p < 0 ? [] : kids.slice(p + 1);
  const isNone = k => !k || name(k) === 'none';
  if (post.length > 2 || pre.length > 2) ctx.warnings.push('Only one pair of pre- and post-scripts is kept from <mmultiscripts>.');
  let core = base;
  let result;
  if (pre.length) {
    result = el(ctx, 'sPre', arg(ctx, 'sub', isNone(pre[0]) ? null : pre[0]), arg(ctx, 'sup', isNone(pre[1]) ? null : pre[1]), arg(ctx, 'e', core));
  }
  if (post.length) {
    const sub = isNone(post[0]) ? null : post[0], sup = isNone(post[1]) ? null : post[1];
    const e = result ? el(ctx, 'e', result) : arg(ctx, 'e', core);
    if (sub && sup) result = el(ctx, 'sSubSup', e, arg(ctx, 'sub', sub), arg(ctx, 'sup', sup));
    else if (sub) result = el(ctx, 'sSub', e, arg(ctx, 'sub', sub));
    else if (sup) result = el(ctx, 'sSup', e, arg(ctx, 'sup', sup));
  }
  return result || convertNode(ctx, base);
}
