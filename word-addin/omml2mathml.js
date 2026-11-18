// OMML (Office Math Markup Language) -> MathML, with no dependencies.
// Uses only the browser's DOMParser, which Office add-in webviews provide.
//
// Covers the OMML that Word's equation editor creates: runs, fractions, radicals, scripts,
// pre-scripts, n-ary operators, delimiters, functions, accents, bars, group characters,
// limits, boxes, phantoms, matrices and equation arrays. Anything else keeps its contents
// and is listed in `warnings`.

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

// Combining accents in m:acc -> spacing characters for MathML <mover accent="true">.
const ACCENT_CHARS = {
  '̀': '`', '́': '´', '̂': '^', '̃': '~', '̄': '¯', '̅': '‾',
  '̆': '˘', '̇': '˙', '̈': '¨', '̌': 'ˇ', '⃖': '←', '⃗': '→', '⃡': '↔',
  '⃐': '↼', '⃑': '⇀',
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isM = (n, local) => n && n.nodeType === 1 && n.namespaceURI === M_NS && (!local || n.localName === local);
const mChildren = n => Array.from(n.childNodes).filter(c => isM(c));
const child = (n, local) => mChildren(n).find(c => c.localName === local) || null;
/** m:val of a property element, or undefined if absent. */
function val(pr, local) {
  const p = pr && child(pr, local);
  if (!p) return undefined;
  return p.getAttributeNS(M_NS, 'val') ?? p.getAttribute('m:val') ?? '';
}
const isOn = v => v !== undefined && !/^(0|off|false)$/i.test(v);   // present with no value = on

/** Join items into one MathML node (mrow when there are several). */
const row = items => (items.length === 1 ? items[0] : `<mrow>${items.join('')}</mrow>`);
const mo = (s, attrs = '') => `<mo${attrs}>${esc(s)}</mo>`;

/**
 * Convert OMML to MathML.
 * @param {string|Element} input  an m:oMath or m:oMathPara element, or XML containing one
 *   (for example the OOXML package from Word's getOoxml()); the first equation found is used.
 * @returns {{mathml: string, warnings: string[]}}
 */
export function ommlToMathml(input) {
  const root = typeof input === 'string' ? findMath(new DOMParser().parseFromString(input, 'application/xml')) : input;
  if (!root) throw new Error('No OMML equation found.');
  const ctx = { warnings: [] };
  let mathml;
  if (root.localName === 'oMathPara') {
    const lines = mChildren(root).filter(c => c.localName === 'oMath').map(m => row(convertChildren(ctx, m)));
    mathml = lines.length === 1
      ? `<math display="block">${lines[0]}</math>`
      : `<math display="block"><mtable>${lines.map(l => `<mtr><mtd>${l}</mtd></mtr>`).join('')}</mtable></math>`;
  } else {
    mathml = `<math>${row(convertChildren(ctx, root))}</math>`;
  }
  return { mathml, warnings: [...new Set(ctx.warnings)] };
}

/** All top-level equations in an XML document (m:oMathPara, or m:oMath not inside one). */
export function findAllMath(doc) {
  const out = [];
  const walk = n => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      if (isM(c, 'oMathPara') || isM(c, 'oMath')) out.push(c);
      else walk(c);
    }
  };
  const root = doc.documentElement || doc;
  if (isM(root, 'oMathPara') || isM(root, 'oMath')) return [root];
  walk(root);
  return out;
}
function findMath(doc) {
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The OMML is not well-formed XML.');
  return findAllMath(doc)[0] || null;
}

// ---------------------------------------------------------------- conversion

function convertChildren(ctx, n) {
  return mChildren(n).flatMap(c => convert(ctx, c));
}
/** MathML for an argument element such as m:e, m:num, m:sup (an empty argument becomes <mrow/>). */
function argOf(ctx, n, local) {
  const a = n && child(n, local);
  const items = a ? convertChildren(ctx, a) : [];
  return items.length ? row(items) : '<mrow/>';
}
const hasContent = (n, local) => {
  const a = n && child(n, local);
  return !!a && mChildren(a).length > 0;
};

function convert(ctx, n) {
  const pr = child(n, n.localName + 'Pr');
  switch (n.localName) {
    case 'r': return runToMathML(n);
    case 'f': {
      const type = val(pr, 'type') || 'bar';
      const num = argOf(ctx, n, 'num'), den = argOf(ctx, n, 'den');
      if (type === 'lin') return [`<mrow>${num}${mo('/')}${den}</mrow>`];
      if (type === 'noBar') return [`<mfrac linethickness="0">${num}${den}</mfrac>`];
      if (type === 'skw') return [`<mfrac bevelled="true">${num}${den}</mfrac>`];
      return [`<mfrac>${num}${den}</mfrac>`];
    }
    case 'rad': {
      const e = argOf(ctx, n, 'e');
      if (isOn(val(pr, 'degHide')) || !hasContent(n, 'deg')) return [`<msqrt>${e}</msqrt>`];
      return [`<mroot>${e}${argOf(ctx, n, 'deg')}</mroot>`];
    }
    case 'sSup': return [`<msup>${argOf(ctx, n, 'e')}${argOf(ctx, n, 'sup')}</msup>`];
    case 'sSub': return [`<msub>${argOf(ctx, n, 'e')}${argOf(ctx, n, 'sub')}</msub>`];
    case 'sSubSup': return [`<msubsup>${argOf(ctx, n, 'e')}${argOf(ctx, n, 'sub')}${argOf(ctx, n, 'sup')}</msubsup>`];
    case 'sPre': {
      const sub = hasContent(n, 'sub') ? argOf(ctx, n, 'sub') : '<none/>';
      const sup = hasContent(n, 'sup') ? argOf(ctx, n, 'sup') : '<none/>';
      return [`<mmultiscripts>${argOf(ctx, n, 'e')}<mprescripts/>${sub}${sup}</mmultiscripts>`];
    }
    case 'nary': {
      const chr = val(pr, 'chr') || '∫';
      const isIntegral = /[∫∬∭∮∯∰∱∲∳]/.test(chr);
      const loc = val(pr, 'limLoc') || (isIntegral ? 'subSup' : 'undOvr');
      const sub = isOn(val(pr, 'subHide')) || !hasContent(n, 'sub') ? null : argOf(ctx, n, 'sub');
      const sup = isOn(val(pr, 'supHide')) || !hasContent(n, 'sup') ? null : argOf(ctx, n, 'sup');
      const op = mo(chr, ' largeop="true"');
      let opNode;
      if (sub && sup) opNode = loc === 'subSup' ? `<msubsup>${op}${sub}${sup}</msubsup>` : `<munderover>${op}${sub}${sup}</munderover>`;
      else if (sub) opNode = loc === 'subSup' ? `<msub>${op}${sub}</msub>` : `<munder>${op}${sub}</munder>`;
      else if (sup) opNode = loc === 'subSup' ? `<msup>${op}${sup}</msup>` : `<mover>${op}${sup}</mover>`;
      else opNode = op;
      return [opNode, argOf(ctx, n, 'e')];
    }
    case 'd': {
      const beg = val(pr, 'begChr') ?? '(';
      const end = val(pr, 'endChr') ?? ')';
      const sep = val(pr, 'sepChr') ?? '|';
      const parts = mChildren(n).filter(c => c.localName === 'e').map(e => {
        const items = convertChildren(ctx, e);
        return items.length ? row(items) : '';
      });
      const inner = parts.join(sep ? mo(sep, ' separator="true"') : '');
      return [`<mrow>${beg ? mo(beg, ' fence="true"') : ''}${inner}${end ? mo(end, ' fence="true"') : ''}</mrow>`];
    }
    case 'func':
      return [`<mrow>${argOf(ctx, n, 'fName')}${mo('⁡')}${argOf(ctx, n, 'e')}</mrow>`];
    case 'acc': {
      const chr = val(pr, 'chr') ?? '̂';
      return [`<mover accent="true">${argOf(ctx, n, 'e')}${mo(ACCENT_CHARS[chr] || chr)}</mover>`];
    }
    case 'bar': {
      const pos = val(pr, 'pos') || 'bot';
      return pos === 'top'
        ? [`<mover accent="true">${argOf(ctx, n, 'e')}${mo('¯')}</mover>`]
        : [`<munder accentunder="true">${argOf(ctx, n, 'e')}${mo('_')}</munder>`];
    }
    case 'groupChr': {
      const chr = val(pr, 'chr') || '⏟';
      const pos = val(pr, 'pos') || 'bot';
      return pos === 'top'
        ? [`<mover>${argOf(ctx, n, 'e')}${mo(chr)}</mover>`]
        : [`<munder>${argOf(ctx, n, 'e')}${mo(chr)}</munder>`];
    }
    case 'limLow': return [`<munder>${argOf(ctx, n, 'e')}${argOf(ctx, n, 'lim')}</munder>`];
    case 'limUpp': return [`<mover>${argOf(ctx, n, 'e')}${argOf(ctx, n, 'lim')}</mover>`];
    case 'box': return convertChildren(ctx, child(n, 'e') || n);
    case 'borderBox': return [`<menclose notation="box">${argOf(ctx, n, 'e')}</menclose>`];
    case 'phant': {
      const show = val(pr, 'show');
      return show !== undefined && !isOn(show) ? [`<mphantom>${argOf(ctx, n, 'e')}</mphantom>`] : convertChildren(ctx, child(n, 'e') || n);
    }
    case 'm': {
      const rows = mChildren(n).filter(c => c.localName === 'mr').map(mr =>
        `<mtr>${mChildren(mr).filter(c => c.localName === 'e').map(e => `<mtd>${row(convertChildren(ctx, e).concat()) || ''}</mtd>`).join('')}</mtr>`);
      return [`<mtable>${rows.join('')}</mtable>`];
    }
    case 'eqArr': {
      const rows = mChildren(n).filter(c => c.localName === 'e').map(e => `<mtr><mtd>${row(convertChildren(ctx, e))}</mtd></mtr>`);
      return [`<mtable>${rows.join('')}</mtable>`];
    }
    case 'oMath': return convertChildren(ctx, n);
    case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'deg': case 'lim': case 'fName':
      return convertChildren(ctx, n);
    default:
      if (/Pr$/.test(n.localName)) return [];              // property elements
      ctx.warnings.push(`<m:${n.localName}> is not supported; its contents were kept.`);
      return convertChildren(ctx, n);
  }
}

// ---------------------------------------------------------------- runs

const LETTER = /\p{L}/u;

function runToMathML(r) {
  const str = Array.from(r.childNodes)
    .filter(c => c.nodeType === 1 && c.localName === 't')
    .map(t => t.textContent).join('');
  if (!str) return [];
  const rPr = child(r, 'rPr');
  if (rPr && child(rPr, 'nor')) return [`<mtext>${esc(str)}</mtext>`];
  const sty = val(rPr, 'sty');                 // p, b, i, bi; absent = math italic
  const scr = val(rPr, 'scr');                 // roman, script, fraktur, double-struck, sans-serif, monospace
  const variant = mathVariant(sty, scr);

  // A run of 2+ letters in upright style is one word (sin, log, max); otherwise one token per character.
  if (sty === 'p' && /^\p{L}{2,}$/u.test(str)) return [`<mi>${esc(str)}</mi>`];
  const out = [];
  // Numbers: digits with an optional decimal point; a comma stays inside a number only as a
  // thousands separator (1,000), so "0,1" in an interval is 0 , 1.
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\s+|./gsu;
  for (const [tok] of str.matchAll(re)) {
    if (/^\s+$/.test(tok)) continue;
    if (/^\d/.test(tok)) out.push(`<mn>${esc(tok)}</mn>`);
    else if (LETTER.test(tok)) out.push(`<mi${variant ? ` mathvariant="${variant}"` : ''}>${esc(tok)}</mi>`);
    else out.push(mo(tok));
  }
  return out;
}

function mathVariant(sty, scr) {
  const bold = sty === 'b' || sty === 'bi';
  const map = { script: 'script', fraktur: 'fraktur', 'double-struck': 'double-struck', 'sans-serif': 'sans-serif', monospace: 'monospace' };
  if (scr && map[scr]) return bold && (scr === 'script' || scr === 'fraktur' || scr === 'sans-serif') ? `bold-${map[scr]}` : map[scr];
  if (sty === 'p') return 'normal';
  if (sty === 'b') return 'bold';
  if (sty === 'bi') return 'bold-italic';
  return null;
}
