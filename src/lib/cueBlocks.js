// Which slides belong to the block ("section") the editor has open. A block is
// every slide sharing the open slide's base label — "Verse 1", "Verse 1
// (Part 2)" and "Verse 1a" are one block, "Chorus 1" is another. Applying a
// background by block is the common case in a service: one photo behind the
// chorus, without touching the whole song or repainting four chorus slides one
// at a time.
//
// The label -> key function is passed in (App's baseGroupLabel) so there is
// exactly one definition of what a section is in the app.

export const cuesInBlock = (cues, idx, labelOf) => {
  const list = Array.isArray(cues) ? cues : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return [];
  const key = labelOf ? labelOf(list[idx]) : '';
  return list.reduce((out, cue, i) => {
    if ((labelOf ? labelOf(cue) : '') === key) out.push(i);
    return out;
  }, []);
};
