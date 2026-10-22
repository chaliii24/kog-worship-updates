import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Edit3, Square, ChevronLeft, ChevronRight, MonitorPlay, LayoutGrid } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PresentationSlide from './PresentationSlide';
import { stubTap } from '../lib/anim';

function PresentationTile({ slide, num, isLive, selected, onClick, PINK, C, onSelect }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.05, el.clientWidth / 1280));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      data-grid-pos={num - 1}
      className="kog-slide-tile"
      data-selected={selected ? '1' : '0'}
      data-live={isLive ? '1' : '0'}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => { if (onSelect) onSelect(num - 1); onClick(); }}
      title={`Slide ${num} — click to project`}
      style={{ cursor: 'pointer', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, height: 16 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: selected ? 'var(--kog-accent)' : 'var(--ui-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {String(num).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ui-muted)', flexShrink: 0 }}>SLIDE</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--ui-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {slide?.label || ''}
        </span>
        {isLive ? <span className="kog-live-chip">LIVE</span> : null}
      </div>
      <div className="kog-slide-face" style={{ position: 'relative', lineHeight: 0 }}>
        <div
          ref={ref}
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            borderRadius: 6,
            overflow: 'hidden',
            background: '#000',
            border: '1px solid var(--ui-border2)',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
            <PresentationSlide slide={slide} />
          </div>
          <span style={{ position: 'absolute', top: 6, right: 8, background: 'rgba(0,0,0,0.55)', color: isLive ? PINK : '#FFC72C', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, zIndex: 2, fontVariantNumeric: 'tabular-nums' }}>
            #{num}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function PresentationWorkspace() {
  const {
    C, PINK,
    activePresentation,
    firePresentationSlide,
    openPresentationEditor,
    stopPresentation,
  } = useApp();

  const deck = activePresentation?.deck || null;
  const slides = (deck && deck.slides) || [];
  const liveIndex = activePresentation ? activePresentation.index : -1;

  const go = (i) => { if (deck && slides[i]) firePresentationSlide(deck, i, 'ws'); };

  // Selection is browsing state only. It drives the gold tile outline and the
  // pagination; sending a slide live still happens by clicking a tile or using
  // the transport buttons, exactly as before.
  const [selectedIdx, setSelectedIdx] = useState(0);
  const scrollRef = useRef(null);
  useEffect(() => {
    setSelectedIdx(liveIndex >= 0 ? liveIndex : 0);
  }, [liveIndex, deck?.id]);
  useEffect(() => {
    setSelectedIdx((i) => (slides.length ? Math.min(i, slides.length - 1) : 0));
  }, [slides.length]);

  const selectSlide = (i) => {
    setSelectedIdx(i);
    const el = scrollRef.current?.querySelector(`[data-grid-pos="${i}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };

  const pagerItems = (total, current) => {
    if (total <= 9) return Array.from({ length: total }, (_, i) => i);
    const out = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total - 2, current + 2);
    out.push(0);
    if (start > 1) out.push('start-ellipsis');
    for (let i = start; i <= end; i++) out.push(i);
    if (end < total - 2) out.push('end-ellipsis');
    out.push(total - 1);
    return out;
  };

  return (
    <motion.div
      key="presentation"
      initial={{ opacity: 0, x: 26 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -26 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)', height: '100%' }}
    >
      <div className="kog-workspace-toolbar">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="kog-workspace-title" title={deck ? deck.title : 'Slideshow Deck'}>{deck ? deck.title : 'Slideshow Deck'}</h2>
          <p className="kog-workspace-sub">
            {deck ? (
              <>
                <b>{slides.length}</b> slide{slides.length === 1 ? '' : 's'}
                <span aria-hidden="true">·</span>
                <span>{activePresentation ? `Live on slide ${liveIndex + 1}` : 'Standby'}</span>
                <span aria-hidden="true">·</span>
                <span>Selected {slides.length ? selectedIdx + 1 : 0}</span>
              </>
            ) : 'Create a slideshow deck, then present it live.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {activePresentation ? (
            <>
              <button type="button" className="kog-icon-btn" onClick={() => go(liveIndex - 1)} disabled={liveIndex <= 0} title="Previous live slide (or ←)" aria-label="Previous live slide"><ChevronLeft size={14} /></button>
              <span style={{ minWidth: 62, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {liveIndex >= 0 ? `${liveIndex + 1} / ${slides.length}` : `— / ${slides.length}`}
              </span>
              <button type="button" className="kog-icon-btn" onClick={() => go(liveIndex + 1)} disabled={liveIndex >= slides.length - 1} title="Next live slide (or →)" aria-label="Next live slide"><ChevronRight size={14} /></button>
              <span style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 3px' }} aria-hidden="true" />
              <motion.button {...stubTap} onClick={stopPresentation} title="Stop navigating this presentation (live output stays until you send something else)" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,69,69,0.09)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Square size={11} /> Stop</motion.button>
            </>
          ) : null}
          <motion.button
            {...stubTap}
            type="button"
            className="kog-icon-btn"
            onClick={() => openPresentationEditor(deck)}
            title={deck ? 'Edit this slideshow deck' : 'New slideshow deck'}
          >
            <Edit3 size={13} /> {deck ? 'Edit' : 'New'}
          </motion.button>
        </div>
      </div>

      <div className="kog-grid-header">
        <LayoutGrid size={13} color="var(--ui-faint)" aria-hidden="true" />
        <span className="kog-grid-caption">Slides</span>
        <span style={{ fontSize: 11, color: 'var(--ui-faint)', fontVariantNumeric: 'tabular-nums' }}>{slides.length ? `${slides.length} total` : 'Empty'}</span>
        <span style={{ flex: 1 }} />
        <span className="kog-grid-caption kog-header-hide-sm">
          {activePresentation ? `Live ${liveIndex + 1}` : 'Nothing live'}
        </span>
      </div>

      <div ref={scrollRef} className="kog-grid-scroll">
        {slides.length ? (
          <div className="kog-slide-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {slides.map((s, i) => (
              <PresentationTile
                key={s.id || i}
                slide={s}
                num={i + 1}
                isLive={activePresentation && i === liveIndex}
                selected={selectedIdx === i}
                onSelect={selectSlide}
                onClick={() => go(i)}
                PINK={PINK}
                C={C}
              />
            ))}
          </div>
        ) : (
          <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
            <div style={{ width: '100%', maxWidth: 520, border: '1px solid var(--ui-border2)', background: 'var(--ui-elev)', borderRadius: 8, padding: '34px 30px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--ui-border2)', background: 'var(--ui-elev2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <MonitorPlay size={20} color="var(--ui-muted)" strokeWidth={1.6} />
              </div>
              <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ui-text)', letterSpacing: '-0.01em' }}>No slideshow deck is live</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ui-muted)', marginTop: 8, maxWidth: 380 }}>
                Start a new deck, then press <b style={{ color: 'var(--ui-text2)' }}>Present</b> in the list on the left. Its slides appear here to navigate like lyrics.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
                <motion.button {...stubTap} onClick={() => openPresentationEditor(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--kog-accent)', border: '1px solid var(--kog-accent)', color: '#171208', padding: '8px 15px', borderRadius: 5, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}><Plus size={13} /> New Presentation</motion.button>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="kog-pagination" aria-label="Presentation slide navigation">
        <button type="button" className="kog-page-btn" data-nav="1" onClick={() => selectSlide(Math.max(0, selectedIdx - 1))} disabled={!slides.length || selectedIdx <= 0} title="Previous slide (browse only)" aria-label="Previous slide"><ChevronLeft size={13} /></button>
        {slides.length === 0 ? (
          <span style={{ fontSize: 10.5, color: 'var(--ui-faint)', padding: '0 4px' }}>No slides</span>
        ) : pagerItems(slides.length, selectedIdx).map((item) => (
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              className="kog-page-btn"
              data-active={selectedIdx === item ? '1' : '0'}
              data-live={activePresentation && liveIndex === item ? '1' : '0'}
              onClick={() => selectSlide(item)}
              title={`Select slide ${item + 1}${liveIndex === item ? ' (live)' : ''}`}
              aria-label={`Slide ${item + 1}`}
              aria-current={selectedIdx === item ? 'true' : undefined}
            >
              {item + 1}
            </button>
          ) : (
            <span key={item} className="kog-page-ellipsis" aria-hidden="true">…</span>
          )
        ))}
        <button type="button" className="kog-page-btn" data-nav="1" onClick={() => selectSlide(Math.min(slides.length - 1, selectedIdx + 1))} disabled={!slides.length || selectedIdx >= slides.length - 1} title="Next slide (browse only)" aria-label="Next slide"><ChevronRight size={13} /></button>
        {slides.length ? (
          <span className="kog-pagination-meta">{selectedIdx + 1} of {slides.length}{activePresentation ? ` · Live ${liveIndex + 1}` : ' · Standby'}</span>
        ) : null}
      </nav>
    </motion.div>
  );
}
