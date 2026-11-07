// The footer's APPLY TO writes one slide's LOOK onto other slides (all of them
// or just the ticked ones). Kept dependency-free — the caller passes the text
// fitter and the per-line scale restyler — so the mapping can be tested
// without the JSX renderer, and so a missing/odd field can never silently
// produce a NaN box that renders as an empty slide.

export const fitStForCue = (c, size) => ({
  font: c.font,
  size: size ?? c.size,
  lineHeight: c.lineHeight,
  caseMode: c.case,
  pad: c.pad,
  bold: c.bold,
  italic: c.italic,
  letterSpacing: c.letterSpacing,
  highlight: c.highlight,
  fill: c.resizeMode === 'fill',
});

export const visualPatchFromCue = (c) => ({
  font: c.font,
  size: c.size,
  lineHeight: c.lineHeight,
  letterSpacing: c.letterSpacing,
  bold: c.bold !== false,
  italic: !!c.italic,
  underline: !!c.underline,
  strike: !!c.strike,
  case: c.case || 'none',
  align: c.align || 'center',
  valign: c.valign || 'middle',
  color: c.color,
  shadow: !!c.shadow,
  shadowColor: c.shadowColor,
  shadowBlur: c.shadowBlur,
  shadowOffsetX: c.shadowOffsetX,
  shadowOffsetY: c.shadowOffsetY,
  glow: !!c.glow,
  glowColor: c.glowColor,
  glowBlur: c.glowBlur,
  outline: !!c.outline,
  strokeOnly: !!c.strokeOnly,
  strokeColor: c.strokeColor,
  strokeWidth: c.strokeWidth,
  opacity: c.opacity,
  blendMode: c.blendMode,
  gradient: !!c.gradient,
  gradientColor1: c.gradientColor1,
  gradientColor2: c.gradientColor2,
  gradientAngle: c.gradientAngle,
  highlight: !!c.highlight,
  hlOpacity: c.hlOpacity,
  anim: c.anim || 'none',
  speed: c.speed,
});

/**
 * @param song        the draft song
 * @param sourceCue   the slide (or text box) whose look is being copied
 * @param scope       'all' | anything else (= the ticked slides in `hit`)
 * @param hit         slide indexes; -1 means the title slide
 * @param refit       (cue) => cue — refits the box to the cue's own text
 * @param restyle     (srcText, targetText) => string — carries per-line sizes
 * @returns a NEW song object; untouched slides keep their identity
 */
export const applyLookToSong = (song, { sourceCue, scope = 'this', hit = [], refit, restyle } = {}) => {
  if (!song || !sourceCue) return song;
  const patch = { ...visualPatchFromCue(sourceCue) };
  if (sourceCue.box) patch.box = { ...sourceCue.box };
  patch.resizeMode = sourceCue.resizeMode || 'fit';
  patch.fillMin = sourceCue.fillMin ?? 18;
  patch.fillMax = sourceCue.fillMax ?? 165;
  // Only an explicit pad travels — a cue on auto padding stays on auto and
  // re-derives its gutter from the applied size.
  if (sourceCue.pad != null) patch.pad = sourceCue.pad;

  const cues = song.cues || [];
  const targets = scope === 'all'
    ? cues.map((_, i) => i)
    : (hit || []).filter((i) => Number.isInteger(i) && i >= 0 && i < cues.length);
  const mark = new Set(targets);
  const hasTitle = !!song.title_cue && (scope === 'all' || (hit || []).includes(-1));
  const srcText = sourceCue.text || '';
  const fit = (next) => (refit ? refit(next) : next);

  return {
    ...song,
    // The title keeps its own words: lyric line-scales mean nothing on a
    // one-line title and only injected junk markers into it.
    title_cue: hasTitle ? fit({ ...(song.title_cue || {}), ...patch }) : song.title_cue,
    cues: cues.map((cu, i) => (
      mark.has(i)
        ? fit({ ...cu, ...patch, text: restyle ? restyle(srcText, cu.text || '') : cu.text })
        : cu
    )),
  };
};
