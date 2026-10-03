import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, X, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { songSections } from '../lib/medley';

// Link Song modal: attach stanzas of a secondary song to the end of an
// anchor song. Search → pick a song → tick exactly the sections to include
// (Chorus, Bridge…) → Link to Song. Repeat per link. Saving hands the link
// list back; App turns the row into a medley item (or back into a plain
// song row when every link is removed).
export default function MedleyModal({ anchor, existing, onSave, onClose, anchorArranged }) {
  const { C, ACCENT, songs, appConfirm } = useApp();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null); // { song, sections }
  const [checked, setChecked] = useState([]);
  const [skipTitle, setSkipTitle] = useState(true);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState(() => (existing || []).map((l) => ({ ...l })));
  const [anchorCues, setAnchorCues] = useState(null);
  const [anchorChecked, setAnchorChecked] = useState([]);
  // Full library for search + title resolution (see App.openMedleyForRow for
  // why the filtered Songs-tab list can't be trusted here).
  const [libAll, setLibAll] = useState(null);
  useEffect(() => {
    if (!window.require) return;
    window.require('electron').ipcRenderer.invoke('db-get-songs', '', 'All')
      .then((full) => { if (Array.isArray(full) && full.length) setLibAll(full); })
      .catch(() => {});
  }, []);
  const toggleAnchorPart = (part) => {
    setAnchorChecked((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  };
  const anchorSections = useMemo(() => songSections({ cues: anchorCues || [] }), [anchorCues]);
  const anchorParts = anchorChecked.length === anchorSections.length ? ['ALL'] : anchorChecked;
  // Ref mirror so the one-shot hydrate effect sees the opening list.
  const linksRef = useRef(null);
  linksRef.current = links;

  // Dirty guard: X, backdrop-click and Cancel all funnel through here. Link
  // edits that never reach Save Medley (or the separate Save Plan button,
  // which does NOT save the modal) used to vanish without a word — then the
  // old flow kept playing and read as "saving adds everything back".
  const snapOf = (aParts, lks) => JSON.stringify({
    a: [...(aParts || [])].sort(),
    l: (lks || []).map((l) => ({
      s: String(l.songId),
      p: [...(l.parts || [])].sort(),
      k: l.skip !== false,
    })).sort((x, y) => (x.s < y.s ? -1 : 1)),
  });
  const openedSnapRef = useRef(null);
  // Saved anchor parts (or ALL for a fresh row) — the baseline for dirty
  // checks AND the stand-in current value until details load (otherwise the
  // modal opens "dirty" before the operator touches anything).
  const savedAnchorParts = Array.isArray(anchor?.parts) && anchor.parts.length ? anchor.parts : ['ALL'];
  if (openedSnapRef.current === null) {
    const initLinks = (existing || []).map((l) => ({ ...l }));
    openedSnapRef.current = snapOf(savedAnchorParts, initLinks);
  }
  const effAnchor = anchorCues ? anchorParts : savedAnchorParts;
  const isDirty = () => snapOf(effAnchor, links) !== openedSnapRef.current;
  const maybeClose = async () => {
    if (!isDirty()) { onClose(); return; }
    const ok = appConfirm
      ? await appConfirm('Discard medley changes? The flow on screen keeps the last saved version.', { confirmLabel: 'Discard' })
      : true;
    if (ok) onClose();
  };

  // Anchor details (for the slide count) + repair the working list when the
  // modal opens on an already-linked row.
  useEffect(() => {
    if (!window.require || !anchor?.songId) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('db-get-song-details', anchor.songId)
      .then((d) => {
        if (!d) return;
        setAnchorCues(d.cues || []);
        // Anchor parts default to ALL; an explicit saved list is honoured.
        const secs = songSections(d);
        const saved = Array.isArray(anchor?.parts) && !anchor.parts.includes('ALL') ? anchor.parts : null;
        setAnchorChecked(saved && saved.length ? secs.filter((s) => saved.includes(s)) : secs);
      })
      .catch(() => {});
  }, [anchor?.songId]);

  // Hydrate existing links' details once (for per-link slide counts) —
  // saved rows carry parts but not cues.
  useEffect(() => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    let dead = false;
    (async () => {
      const cur = linksRef.current || [];
      const missing = cur.filter((l) => !l._details);
      if (!missing.length) return;
      const got = {};
      for (const l of missing) {
        try {
          const d = await ipcRenderer.invoke('db-get-song-details', l.songId);
          if (!d || dead) return;
          got[String(l.songId)] = { cues: d.cues || [] };
        } catch { return; }
      }
      if (dead) return;
      setLinks((prev) => prev.map((l) => (got[String(l.songId)] && !l._details ? { ...l, _details: got[String(l.songId)] } : l)));
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Search the FULL library, not the Songs tab's filtered view (a search
    // or category filter there used to hide songs from this picker too).
    const pool = libAll || songs || [];
    return pool
      .filter((s) => String(s.id) !== String(anchor?.songId))
      .filter((s) => !q || `${s.title || ''} ${s.artist || ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [libAll, songs, query, anchor]);

  const pickSong = async (song) => {
    if (!window.require) return;
    setLoading(true);
    try {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-song-details', song.id);
      if (!details) return;
      setPicked(details);
      // Explicit opt-in: start with NOTHING checked, so tapping Chorus means
      // "only Chorus". (Pre-checking everything inverted the gesture — one
      // tap on Chorus saved everything-but-Chorus, verses included.)
      setChecked([]);
      setSkipTitle(true);
    } finally {
      setLoading(false);
    }
  };

  const togglePart = (part) => {
    setChecked((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  };

  const countFor = (songId, parts, skip, cues) => {
    const list = (cues || []).filter((c) => {
      if (!parts || parts.includes('ALL')) return true;
      const base = String(c?.label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim().toLowerCase();
      return parts.some((p) => String(p).toLowerCase() === base);
    });
    return (skip ? 0 : 1) + list.length;
  };

  const save = () => {
    // Exact-ish count now (anchor parts + each link); Go Live refreshes it
    // against reality anyway.
    let n = 1 + (anchorCues || []).filter((c) => {
      if (anchorParts.includes('ALL')) return true;
      const base = String(c?.label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim().toLowerCase();
      return anchorParts.some((p) => String(p).toLowerCase() === base);
    }).length;
    for (const l of links) {
      const det = l._details;
      n += countFor(l.songId, l.parts, l.skip, det ? det.cues : null) || 0;
    }
    onSave({
      anchorParts,
      // Contract with App.saveMedley: { songId, title, parts, skip }.
      // (A previous revision sent { includedParts, skipTitleSlide } here and
      // App re-mapped l.parts -> undefined -> ALL on every save.)
      links: links.map((l) => ({
        songId: l.songId,
        title: l.title,
        parts: l.parts !== undefined ? l.parts : l.includedParts,
        skip: l.skip !== undefined ? l.skip : l.skipTitleSlide,
      })),
      slideCount: n,
      anchorTitle: anchor?.title || '',
    });
  };

  // Keep each link's details for counting (loaded at pick time).
  const linkPickedWithDetails = () => {
    if (!picked || !checked.length) return;
    const det = { cues: picked.cues || [] };
    setLinks((prev) => {
      const rest = prev.filter((l) => String(l.songId) !== String(picked.id));
      return [...rest, { songId: picked.id, title: picked.title, parts: [...checked], skip: skipTitle, _details: det }];
    });
    setPicked(null);
    setChecked([]);
    setQuery('');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }} onClick={maybeClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, padding: 18, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Link2 size={15} color={ACCENT} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>Link Song Medley</h2>
          <button onClick={maybeClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginBottom: 12 }}>
          Slides flow <b style={{ color: C.text }}>{anchor?.title || 'Anchor song'}</b> → linked parts, with no secondary title slides. Live arrows walk the whole flow.
        </div>

        {anchorSections.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Anchor song parts — {anchor?.title || ''}</div>
            {anchorArranged && (
              <div style={{ fontSize: 11, color: '#C4B5FD', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 7, padding: '6px 9px', marginBottom: 7 }}>
                Anchor plays a custom arrangement — the flow follows it. Change it with the Arrange button on the service row.
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {anchorSections.map((part) => {
                const on = anchorChecked.includes(part);
                return (
                  <button
                    key={part}
                    onClick={() => toggleAnchorPart(part)}
                    style={{ background: on ? ACCENT : C.elevated2, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), color: on ? '#fff' : C.muted, borderRadius: 999, padding: '6px 13px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                  >{part}</button>
                );
              })}
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {links.map((l, i) => (
              <div key={`${l.songId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, flexShrink: 0 }}>{i + 2}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title || 'Song'}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{(l.parts || []).join(', ') || 'ALL'}{l.skip === false ? '' : ' · no title'} · {countFor(l.songId, l.parts && l.parts.length ? l.parts : ['ALL'], l.skip, l._details ? l._details.cues : null)} slides</div>
                </div>
                <button onClick={() => setLinks((prev) => prev.filter((_, x) => x !== i))} title="Remove link" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', padding: 4 }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <label style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 }}>Find secondary song</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or artist…"
          style={{ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
        />
        {query.trim() !== '' && !picked && (
          <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((s) => (
              <button key={s.id} onClick={() => pickSong(s)} style={{ textAlign: 'left', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {s.title} <span style={{ color: C.muted, fontWeight: 600 }}>· {s.artist || 'Unknown'}</span>
              </button>
            ))}
            {!results.length && <div style={{ fontSize: 11.5, color: C.faint2 }}>No matches.</div>}
          </div>
        )}

        {picked && (
          <div style={{ marginTop: 10, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 2 }}>{picked.title}</div>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, margin: '8px 0 6px 0' }}>Include parts — tick only what plays</div>
            {loading ? (
              <div style={{ fontSize: 12, color: C.muted }}>Reading sections…</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(songSections(picked).length ? songSections(picked) : ['ALL']).map((part) => {
                  const on = checked.includes(part);
                  return (
                    <button
                      key={part}
                      onClick={() => togglePart(part)}
                      style={{ background: on ? ACCENT : C.elevated2, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), color: on ? '#fff' : C.muted, borderRadius: 999, padding: '6px 13px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                    >{part}</button>
                  );
                })}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={skipTitle} onChange={(e) => setSkipTitle(e.target.checked)} />
              Skip the title slide for this song
            </label>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={() => { setPicked(null); setChecked([]); }} style={{ flex: 1, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={linkPickedWithDetails} disabled={!checked.length} style={{ flex: 2, background: checked.length ? ACCENT : C.elevated2, border: 'none', color: '#fff', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 800, cursor: checked.length ? 'pointer' : 'default', opacity: checked.length ? 1 : 0.5 }}>
                <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /> Link to Song
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={maybeClose} style={{ flex: 1, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={save}
            style={{ flex: 2, background: ACCENT, border: 'none', color: '#fff', borderRadius: 8, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
          >
            {links.length ? `Save Medley (${links.length} link${links.length === 1 ? '' : 's'})` : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
