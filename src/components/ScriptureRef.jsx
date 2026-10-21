import React from 'react';
import { scriptureTemplateOf } from '../lib/scriptureTemplates';

/**
 * The passage reference on the wall — "John 3:16" (optionally with its
 * translation) drawn as its OWN element instead of a line inside the text
 * block.
 *
 * It lives outside the lyric box so a template can put it in a corner and
 * size it independently of the words (the reference is metadata, not part of
 * the passage, and a fill-fitted block would otherwise make the two the same
 * size). Everything here is in design canvas pixels, like the lyric box, so
 * the projector and the console preview draw it identically.
 */
const ScriptureRef = ({ meta, title, color, font, templateId }) => {
  const tpl = scriptureTemplateOf(templateId || (meta && meta.template));
  const pos = (tpl.ref && tpl.ref.pos) || 'hidden';
  // 'inline' is the Default template: the reference stays a line of the
  // passage text (the original look), so this element draws nothing.
  if (pos === 'hidden' || pos === 'inline') return null;

  const ref = String((meta && meta.ref) || title || '').trim();
  if (!ref) return null;
  const withTrans = tpl.ref.translation && meta && meta.translation
    ? `${ref} (${String(meta.translation).toUpperCase()})`
    : ref;

  // Follows the scripture text colour, dimmed — it must read as a caption,
  // never compete with the verse.
  const rgba = (() => {
    const c = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!c) return 'rgba(255,255,255,0.82)';
    const n = parseInt(c[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${tpl.ref.opacity != null ? tpl.ref.opacity : 0.8})`;
  })();

  const edge = 56;
  const box = { position: 'absolute', zIndex: 1, maxWidth: `calc(100% - ${edge * 2}px)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: font || tpl.font, fontSize: tpl.ref.size || 30, fontWeight: 600, letterSpacing: '0.02em', lineHeight: 1.25, color: rgba, textShadow: '0 2px 10px rgba(0,0,0,0.75)', pointerEvents: 'none' };

  if (pos === 'top-left') return <div style={{ ...box, left: edge, top: 56 }}>{withTrans}</div>;
  if (pos === 'top-center') return <div style={{ ...box, left: 0, right: 0, top: 56, textAlign: 'center' }}>{withTrans}</div>;
  if (pos === 'top-right') return <div style={{ ...box, right: edge, top: 56, textAlign: 'right' }}>{withTrans}</div>;
  if (pos === 'bottom-left') return <div style={{ ...box, left: edge, bottom: 48 }}>{withTrans}</div>;
  if (pos === 'bottom-center') return <div style={{ ...box, left: 0, right: 0, bottom: 48, textAlign: 'center' }}>{withTrans}</div>;
  return <div style={{ ...box, right: edge, bottom: 48, textAlign: 'right' }}>{withTrans}</div>;
};

export default ScriptureRef;
