import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Folder, Image, Film, Trash2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { ANIMATED_GRADIENTS } from './CountdownFace';

const mediaKind = (asset) => (asset?.kind === 'video' ? 'video' : 'image');

const assetName = (asset) => {
  if (asset?.name) return asset.name;
  try {
    return decodeURIComponent(String(asset?.url || '').split('/').pop().split('?')[0]) || 'Media asset';
  } catch {
    return 'Media asset';
  }
};

const assetSize = (asset) => {
  if (asset?.size) {
    const mb = asset.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(asset.size / 1024))} KB`;
  }
  return '—';
};

const toBg = (song) => ({
  type: song?.bg_type || 'color',
  url: song?.bg_value || '#000000',
  title:
    song?.bg_type === 'color'
      ? 'Solid color'
      : song?.bg_type === 'gradient'
      ? 'Gradient'
      : song?.bg_type === 'animated'
      ? 'Animated gradient'
      : assetName({ url: song?.bg_value, name: song?.bg_value }),
  css: song?.bg_type === 'gradient' || song?.bg_type === 'animated' ? song?.bg_value : undefined,
});

export default function SongBackgroundPanel({
  C,
  ACCENT,
  editingSong,
  setEditingSong,
  mediaLibrary,
  setSongBackground,
  songBgFileToBackground,
  songHasBackground,
}) {
  const [activeBg, setActiveBg] = useState(() => toBg(editingSong));
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  /* Secondary button inside the gallery chrome. Theme tokens only — the
     gallery used to be hardcoded zinc/amber, which read as a different app
     next to the space-grey panels around it. */
  const galleryBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--ui-elev)',
    color: 'var(--ui-text2)',
    border: '1px solid var(--ui-border2)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const fileInputRef = useRef(null);

  useEffect(() => {
    setActiveBg(toBg(editingSong));
  }, [editingSong?.bg_type, editingSong?.bg_value]);

  const mediaAssets = useMemo(
    () => (mediaLibrary || []).filter((a) => a.kind === 'image' || a.kind === 'video'),
    [mediaLibrary]
  );

  const filteredAssets = useMemo(() => {
    return mediaAssets.filter((item) => {
      const matchesType =
        galleryFilter === 'all' ||
        (galleryFilter === 'images' && item.kind === 'image') ||
        (galleryFilter === 'videos' && item.kind === 'video');
      const matchesSearch = assetName(item).toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [mediaAssets, galleryFilter, searchQuery]);

  const applyGradient = (grad) => {
    setSongBackground('gradient', grad.css);
    setActiveBg({ type: 'gradient', url: '', title: grad.name, css: grad.css });
  };

  const applyFileSelect = (file) => {
    const newBg = {
      type: file.kind,
      url: file.url,
      title: assetName(file),
      css: file.kind === 'video' ? undefined : undefined,
    };
    setSongBackground(file.kind, file.url);
    setActiveBg(newBg);
    setIsGalleryModalOpen(false);
  };

  const handleClearBg = () => {
    setSongBackground('color', '#000000');
    setActiveBg({ type: 'none', url: '', title: 'Solid Black (Default)', css: '#000000' });
  };

  const handleLocalFile = (file) => {
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    songBgFileToBackground(kind, file);
    setIsGalleryModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Quick Controls */}
      <div>
        <label className="text-[11px] font-semibold text-[var(--ui-muted)] uppercase tracking-wider mb-2 block">
          Quick Controls
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setIsGalleryModalOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[var(--ui-elev)] hover:bg-[var(--ui-elev2)] text-[var(--ui-text2)] border border-[var(--ui-border2)] hover:border-[var(--kog-accent)] rounded-xl text-xs font-medium transition active:scale-95"
          >
            <Image className="w-3.5 h-3.5" style={{ color: 'var(--kog-accent)' }} />
            Image
          </button>
          <button
            onClick={() => setIsGalleryModalOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[var(--ui-elev)] hover:bg-[var(--ui-elev2)] text-[var(--ui-text2)] border border-[var(--ui-border2)] hover:border-[var(--kog-accent)] rounded-xl text-xs font-medium transition active:scale-95"
          >
            <Film className="w-3.5 h-3.5" style={{ color: 'var(--kog-accent)' }} />
            Video
          </button>
          <button
            onClick={handleClearBg}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[var(--ui-elev)] hover:bg-rose-950/50 hover:border-rose-700/50 text-[var(--ui-text2)] hover:text-rose-300 border border-[var(--ui-border2)] rounded-xl text-xs font-medium transition active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ui-muted)' }} />
            Clear
          </button>
        </div>
      </div>

      {/* Instant Gradients */}
      <div>
        <label className="text-[11px] font-semibold text-[var(--ui-muted)] uppercase tracking-wider mb-2 block">
          Instant Gradients
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {GRADIENT_PACK.map((grad, i) => (
            <button
              key={i}
              onClick={() => applyGradient(grad)}
              title={grad.name}
              className="w-9 h-9 rounded-full shrink-0 border-2 border-[var(--ui-border2)] hover:border-[var(--kog-accent)] transition transform hover:scale-110 active:scale-90 relative"
              style={{ background: grad.css }}
            />
          ))}
          {ANIMATED_GRADIENTS.map((g, i) => (
            <button
              key={`anim-${i}`}
              onClick={() => setSongBackground('animated', `anim:${g.id}`)}
              title={g.name}
              className="w-9 h-9 rounded-full shrink-0 border-2 border-[var(--ui-border2)] hover:border-[var(--kog-accent)] transition transform hover:scale-110 active:scale-90 relative overflow-hidden"
              style={{ background: g.base }}
            />
          ))}
        </div>
      </div>

      {/* Deferred Media Library */}
      <div className="pt-2 border-t border-[var(--ui-border)] space-y-3">
        <label className="text-[11px] font-semibold text-[var(--ui-muted)] uppercase tracking-wider block">
          Media Sources
        </label>

        <button
          onClick={() => setIsGalleryModalOpen(true)}
          className="w-full h-12 justify-start px-4 font-medium inline-flex items-center rounded-xl border border-[var(--ui-border2)] bg-[var(--ui-elev)] text-[var(--ui-text2)] transition hover:bg-[var(--ui-elev2)] hover:border-[var(--kog-accent)]"
        >
          <LayoutGrid className="w-4 h-4 mr-3" />
          Open Media Gallery
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 justify-start px-4 font-medium inline-flex items-center rounded-xl border border-[var(--ui-border2)] bg-[var(--ui-elev)] text-[var(--ui-text2)] transition hover:bg-[var(--ui-elev2)] hover:border-[var(--kog-accent)]"
        >
          <Folder className="w-4 h-4 mr-3" />
          Browse OS Folder Directly
        </button>
      </div>

      {/* Active Background Info */}
      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-elev)] p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ui-faint)] mb-1">
          Active Background
        </div>
        <div className="text-sm font-bold text-[var(--ui-text)] truncate">{activeBg.title || 'Background'}</div>
        <div className="text-[10px] text-[var(--ui-text2)] capitalize">{activeBg.type || 'none'}</div>
      </div>

      {/* Hidden native file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleLocalFile(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />

      {/* COMPACT MEDIA GALLERY MODAL */}
      <AnimatePresence>
        {isGalleryModalOpen && (
          <motion.div
            key="media-gallery-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3"
            style={{ background: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              key="media-gallery-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-3xl h-[65vh] flex flex-col overflow-hidden"
              style={{ background: 'var(--ui-panel)', border: '1px solid var(--ui-border)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)' }}
            >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--ui-panel)', borderBottom: '1px solid var(--ui-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <LayoutGrid style={{ color: 'var(--kog-accent)', fontSize: 13 }} />
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ui-text)', whiteSpace: 'nowrap' }}>Media Gallery</h3>
              </div>
              <button
                onClick={() => setIsGalleryModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--ui-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 6, borderRadius: 7 }}
              >
                ✕
              </button>
            </div>

            {/* Filter & action bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', background: 'var(--ui-elev)', borderBottom: '1px solid var(--ui-border)', flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 300, minWidth: 0 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assets..."
                  style={{ width: '100%', background: 'var(--ui-input)', border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 26px 7px 10px', fontSize: 11.5, color: 'var(--ui-text)', outline: 'none' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--ui-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={() => fileInputRef.current?.click()} style={galleryBtn}>
                  <Folder style={{ color: 'var(--kog-accent)' }} />
                  <span>Open Folder</span>
                </button>

                <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'var(--ui-input)', border: '1px solid var(--ui-border2)' }}>
                  {[['all', `All (${mediaAssets.length})`], ['images', 'Images'], ['videos', 'Videos']].map(([key, label]) => {
                    const on = galleryFilter === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setGalleryFilter(key)}
                        style={{ background: on ? 'var(--kog-accent)' : 'transparent', color: on ? '#1C1C1E' : 'var(--ui-text2)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Media grid — every card is the same 16:9 tile with its label in
                a footer band. The thumbnail box is sized with padding-top
                instead of aspect-ratio, so a card can never collapse to a
                strip and the grid stays a tidy, uniform wall of tiles. */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: 'var(--ui-bg)' }}>
              {filteredAssets.length === 0 ? (
                <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--ui-muted)' }}>
                  <Search style={{ fontSize: 18, color: 'var(--ui-muted)' }} />
                  <p style={{ margin: 0 }}>No assets found.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignItems: 'start' }}>
                  {filteredAssets.map((file, idx) => {
                    const kind = mediaKind(file);
                    const isActive =
                      (editingSong?.bg_type === kind && editingSong?.bg_value === file.url) ||
                      (activeBg?.type === kind && activeBg?.url === file.url);

                    return (
                      <div
                        key={file.url || idx}
                        onClick={() => applyFileSelect(file)}
                        style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'var(--ui-elev)', border: isActive ? '2px solid var(--kog-accent)' : '1px solid var(--ui-border)', boxShadow: isActive ? '0 0 0 2px rgba(255, 184, 0, 0.18)' : 'none' }}
                      >
                        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
                          {kind === 'video' ? (
                            <video
                              src={file.url}
                              muted
                              playsInline
                              preload="metadata"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <img
                              src={file.url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          )}

                          {/* Gradient kept for badge legibility */}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.04))', pointerEvents: 'none' }} />

                          <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#F1F2F3', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '2px 5px' }}>
                            {kind}
                          </span>

                          {isActive && (
                            <span style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 999, background: 'var(--kog-accent)', color: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>
                              ✓
                            </span>
                          )}
                        </div>

                        <div style={{ padding: '7px 8px 8px', minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ui-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {assetName(file)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2, fontSize: 9.5, color: 'var(--ui-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assetSize(file)}</span>
                            <span style={{ flexShrink: 0, textTransform: 'capitalize' }}>{kind}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', background: 'var(--ui-panel)', borderTop: '1px solid var(--ui-border)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--ui-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                Showing {filteredAssets.length} of {mediaAssets.length} assets
              </span>
              <button onClick={() => setIsGalleryModalOpen(false)} style={{ ...galleryBtn, padding: '6px 14px' }}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
