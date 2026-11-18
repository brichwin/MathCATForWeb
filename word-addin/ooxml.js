// OOXML helpers for inserting and replacing Word equations. No dependencies.
// Word's getOoxml() returns a "flat OPC" package (pkg:package); insertOoxml() accepts one.

import { M_NS, W_NS } from './mathml2omml.js';
import { findAllMath } from './omml2mathml.js';

const PKG_NS = 'http://schemas.microsoft.com/office/2006/xmlPackage';

/** A minimal package holding one paragraph with the given OMML (m:oMath or m:oMathPara). */
export function packageForOmml(omml) {
  return `<pkg:package xmlns:pkg="${PKG_NS}">` +
    '<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships></pkg:xmlData></pkg:part>' +
    '<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>' +
    `<w:document xmlns:w="${W_NS}" xmlns:m="${M_NS}"><w:body><w:p>${omml}</w:p></w:body></w:document>` +
    '</pkg:xmlData></pkg:part></pkg:package>';
}

export function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Word returned XML that could not be read.');
  return doc;
}

/** The document body of a package (or of a bare w:document). */
function body(doc) {
  return doc.getElementsByTagNameNS(W_NS, 'body')[0] || null;
}

/** Top-level equations (m:oMathPara, or m:oMath outside one) in a package's document body. */
export function findEquations(xml) {
  const doc = parseXml(xml);
  const b = body(doc);
  return { doc, equations: b ? findAllMath(b) : [] };
}

/**
 * Replace one equation in a package with new OMML and return the package as a string.
 * @param {Document} doc       parsed package from findEquations()
 * @param {Element} target     the equation element to replace
 * @param {string} omml        new m:oMath or m:oMathPara
 */
export function replaceEquation(doc, target, omml) {
  const fresh = parseXml(omml).documentElement;
  let node = doc.importNode(fresh, true);
  // An m:oMathPara can only sit directly in a paragraph. Inside a run of text, use its m:oMath.
  if (node.localName === 'oMathPara' && target.localName === 'oMath' && target.parentNode.localName !== 'p') {
    node = node.getElementsByTagNameNS(M_NS, 'oMath')[0];
  }
  target.parentNode.replaceChild(node, target);
  return new XMLSerializer().serializeToString(doc);
}
