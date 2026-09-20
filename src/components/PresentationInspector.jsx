import React, { useState } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Upload, Search, Loader2, Palette, Type, Layers, FileText, Trash2
} from 'lucide-react';
import { GRADIENT_PACK, PRESENTATION_FONTS, PRESENTATION_TRANSITIONS, PRESENTATION_LAYOUTS as LAYOUTS } from '../lib/backgrounds';

const SECTION = { fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.3, margin: '2px 0 6px 0' };
const FIELD = { width: '100%', background: '#0d1117', border: '1px solid #2d2d3f', borderRadius: 7, padding: '7px 8px', color: '#F8FAFC', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
const LBL = { fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 };

function SearchBox({ C, ACCENT, searchQ, setSearchQ, runSearch, busy, searchResults, onPick, status }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} placeholder="Search free photos (Online)…" style={{ ...FIELD, flex: 1 }} />
        <button onClick={runSearch} disabled={busy === 'search'} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '7px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          {busy === 'search' ? <Loader2 size={13} /> : <Search size={13} />} Search
        </button>
      </div>
      {searchResults.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {searchResults.map(r => (
            <button key={r.id} onClick={() => onPick(r)} title={r.title} style={{ position: 'relative', border: '1px solid #2d2d3f', borderRadius: 7, overflow: 'hidden', padding: 0, cursor: busy === 'dl-' + r.id ? 'wait' : 'pointer', background: '#000', height: 62 }}>
              <img src={r.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {busy === 'dl-' + r.id && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}><Loader2 size={16} color="#fff" /></span>}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#475569' }}>Online results are Creative Commons photos (Openverse). Downloading saves the image into your library.</div>
    </div>
  );
}

export default function PresentationInspector({
  C, ACCENT, slide, patchSlide,
  mediaLibrary, persistMediaFile, fetchMediaLibrary, setStatus,
  searchQ, setSearchQ, searchResults, setSearchResults, runSearch, downloadBg, busy, tab, setTab
}) {
  if (!slide) return <div style={{ padding: 16, color: C.muted, fontSize: 12 }}>No slide selected.</div>;

  const imageAssets = (mediaLibrary || []).filter(a => a.kind === 'image');
  const videoAssets = (mediaLibrary || []).filter(a => a.kind === 'video');

  const uploadImage = async (e, target) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (url) {
      if (fetchMediaLibrary) await fetchMediaLibrary();
      if (target === 'image') patchSlide({ image: url });
      else patchSlide({ bg: { type: file.type.startsWith('video') ? 'video' : 'image', value: url } });
    }
    e.target.value = '';
  };

  const applyOnline = (r) => downloadBg(r);

  const tabBtn = (id, label, Icon) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, background: tab === id ? 'rgba(59,130,246,0.18)' : 'transparent', border: tab === id ? '1px solid ' + ACCENT : '1px solid #2d2d3f', color: tab === id ? C.heading : C.muted, padding: '6px 4px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div style={{ width: 330, minWidth: 330, borderLeft: '1px solid #262639', overflowY: 'auto', padding: 14, display: 'grid', gap: 14, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {tabBtn('content', 'Text', Type)}
        {tabBtn('background', 'BG', Palette)}
        {tabBtn('image', 'Image', ImageIcon)}
      </div>

      {tab === 'content' && (
        <>
          <div>
            <span style={SECTION}>Title</span>
            <input value={slide.title} onChange={(e) => patchSlide({ title: e.target.value })} placeholder="Slide title" style={FIELD} />
          </div>
          <div>
            <span style={SECTION}>Subtitle</span>
            <input value={slide.subtitle} onChange={(e) => patchSlide({ subtitle: e.target.value })} placeholder="Optional subtitle" style={FIELD} />
          </div>
          <div>
            <span style={SECTION}>Bullets (one per line)</span>
            <textarea rows={6} value={(slide.bullets || []).join('\n')} onChange={(e) => patchSlide({ bullets: e.target.value.split('\n') })} placeholder={'First point\nSecond point\nThird point'} style={{ ...FIELD, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div>
            <span style={SECTION}>Body text (Quote / custom)</span>
            <textarea rows={3} value={slide.body || ''} onChange={(e) => patchSlide({ body: e.target.value })} placeholder="Used by the Quote layout" style={{ ...FIELD, resize: 'vertical' }} />
          </div>

          <div>
            <span style={SECTION}>Font</span>
            <select value={slide.font} onChange={(e) => patchSlide({ font: e.target.value })} style={FIELD}>
              {PRESENTATION_FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={LBL}>Title size</span>
              <input type="number" value={slide.titleSize || 42} onChange={(e) => patchSlide({ titleSize: Math.max(16, Number(e.target.value) || 42) })} style={{ ...FIELD, textAlign: 'center' }} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={LBL}>Body size</span>
              <input type="number" value={slide.bodySize || 24} onChange={(e) => patchSlide({ bodySize: Math.max(12, Number(e.target.value) || 24) })} style={{ ...FIELD, textAlign: 'center' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <span style={LBL}>Text color</span>
              <input type="color" value={slide.textColor || '#ffffff'} onChange={(e) => patchSlide({ textColor: e.target.value })} style={{ width: '100%', height: 30, background: '#0d1117', border: '1px solid #2d2d3f', borderRadius: 7, cursor: 'pointer' }} />
            </div>
            <div style={{ flex: 2 }}>
              <span style={LBL}>Align</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
                  <button key={a} onClick={() => patchSlide({ align: a })} style={{ flex: 1, background: (slide.align || 'left') === a ? ACCENT : '#0d1117', border: '1px solid #2d2d3f', color: '#fff', borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={13} /></button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <span style={SECTION}>Transition</span>
            <select value={slide.transition} onChange={(e) => patchSlide({ transition: e.target.value })} style={FIELD}>
              {PRESENTATION_TRANSITIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SECTION}>Speaker notes</span>
            <textarea rows={3} value={slide.notes || ''} onChange={(e) => patchSlide({ notes: e.target.value })} placeholder="Only shown on the stage monitor" style={{ ...FIELD, resize: 'vertical' }} />
          </div>
        </>
      )}

      {tab === 'background' && (
        <>
          <div style={{ display: 'flex', gap: 5 }}>
            {[['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Image'], ['video', 'Video']].map(([t, l]) => (
              <button key={t} onClick={() => patchSlide({ bg: { type: t, value: t === 'color' ? '#0B0F19' : t === 'gradient' ? GRADIENT_PACK[0].css : (t === 'image' ? (imageAssets[0]?.url || '') : (videoAssets[0]?.url || '')) } })} style={{ flex: 1, background: (slide.bg?.type || 'color') === t ? ACCENT : '#0d1117', border: '1px solid #2d2d3f', color: '#fff', borderRadius: 6, padding: '5px 0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {(slide.bg?.type === 'color' || !slide.bg?.type) && (
            <input type="color" value={slide.bg?.value || '#0b0f19'} onChange={(e) => patchSlide({ bg: { type: 'color', value: e.target.value } })} style={{ width: '100%', height: 34, background: '#0d1117', border: '1px solid #2d2d3f', borderRadius: 7, cursor: 'pointer' }} />
          )}

          {slide.bg?.type === 'gradient' && (
            <div>
              <span style={SECTION}>Built-in pack (offline)</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {GRADIENT_PACK.map(g => (
                  <button key={g.id} onClick={() => patchSlide({ bg: { type: 'gradient', value: g.css } })} title={g.name} style={{ height: 44, borderRadius: 7, cursor: 'pointer', border: slide.bg?.value === g.css ? '2px solid ' + ACCENT : '1px solid #2d2d3f', backgroundImage: g.css }} />
                ))}
              </div>
            </div>
          )}

          {(slide.bg?.type === 'image' || slide.bg?.type === 'video') && (
            <>
              <label style={{ background: '#161B22', border: '1px solid #2d2d3f', color: C.text2, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Upload size={12} /> Upload from computer
                <input type="file" accept={slide.bg?.type === 'video' ? 'video/*' : 'image/*'} onChange={(e) => uploadImage(e, 'bg')} style={{ display: 'none' }} />
              </label>
              <div>
                <span style={SECTION}>Library</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(slide.bg?.type === 'video' ? videoAssets : imageAssets).map(a => (
                    <button key={a.url} onClick={() => patchSlide({ bg: { type: a.kind, value: a.url } })} style={{ border: slide.bg?.value === a.url ? '2px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 7, overflow: 'hidden', padding: 0, height: 50, cursor: 'pointer', background: '#000' }}>
                      <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span style={SECTION}>Search online</span>
                <SearchBox C={C} ACCENT={ACCENT} searchQ={searchQ} setSearchQ={setSearchQ} runSearch={runSearch} busy={busy} searchResults={searchResults} onPick={applyOnline} />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'image' && (
        <>
          <label style={{ background: '#161B22', border: '1px solid #2d2d3f', color: C.text2, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={12} /> Upload image
            <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'image')} style={{ display: 'none' }} />
          </label>
          <div>
            <span style={SECTION}>Library</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {imageAssets.map(a => (
                <button key={a.url} onClick={() => patchSlide({ image: a.url })} style={{ border: slide.image === a.url ? '2px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 7, overflow: 'hidden', padding: 0, height: 50, cursor: 'pointer', background: '#000' }}>
                  <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={SECTION}>Search online</span>
            <SearchBox C={C} ACCENT={ACCENT} searchQ={searchQ} setSearchQ={setSearchQ} runSearch={runSearch} busy={busy} searchResults={searchResults} onPick={applyOnline} />
          </div>
          {slide.image && (
            <button onClick={() => patchSlide({ image: null })} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', borderRadius: 7, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Trash2 size={12} /> Remove image</button>
          )}
        </>
      )}

      <div>
        <span style={SECTION}>Layout</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
          {LAYOUTS.map(l => (
            <button key={l.id} onClick={() => patchSlide({ layout: l.id, pos: {} })} style={{ background: slide.layout === l.id ? 'rgba(59,130,246,0.18)' : '#0d1117', border: slide.layout === l.id ? '1px solid ' + ACCENT : '1px solid #2d2d3f', color: slide.layout === l.id ? C.heading : C.muted, borderRadius: 7, padding: '7px 4px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>{l.icon}</span> {l.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
