import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Film } from 'lucide-react';
import { thumbUrl } from './mediaThumb';

// ---------------------------------------------------------------------------
// ONE VIRTUALIZED MEDIA LAYOUT FOR EVERY MEDIA SURFACE
//
// A media tab with 300+ clips used to mount 300 cards in one commit: every
// card's decode work, every card's <video> pipeline request (the old tiles used
// a video element as their thumbnail) and every card's layout, all on the
// renderer's main thread. React had to reconcile the lot on the next click, and
// the window stopped responding while it did.
//
// These primitives fix that at the source:
//   * only the rows inside the viewport (+ `overscanRows` of padding above and
//     below) are in the DOM, so 300 files cost ~2 rows of elements;
//   * rows are absolute-positioned at a FIXED height, so scrolling never
//     reflows the page and nothing shifts when a tile enters the DOM;
//   * a tile renders a static poster <img> — NEVER a <video>, even before the
//     background pipeline has produced a poster. With no library cap a grid can
//     hold thousands of clips; decoding even a handful of them inside cards is
//     what used to stall the renderer, so a clip without a still shows a cheap
//     placeholder until 'media-thumb-ready' patches one in.
// ---------------------------------------------------------------------------

const clampInt = (v, min, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : fallback;
};

// Live column count from the scroll box's real width. Cards must stay a
// sensible size on a narrow system sidebar and on a wide centre workspace
// without either surface hard-coding a breakpoint.
export function useGridColumns(scrollRef, { minColWidth = 180, gap = 12 } = {}) {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const read = () => {
      const width = el.clientWidth || 0;
      const n = Math.max(1, Math.floor((width + gap) / (minColWidth + gap)));
      setCols((prev) => (prev === n ? prev : n));
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, minColWidth, gap]);
  return cols;
}

/**
 * Virtualized card grid. `rowHeight` is the tile's own height (the gap is added
 * by the virtualizer), so a caller that renders a fixed-size card gets zero
 * layout shift while scrolling.
 */
export function VirtualMediaGrid({
  items = [],
  minColWidth = 180,
  gap = 12,
  rowHeight = 168,
  overscanRows = 2,
  renderItem,
  empty = null,
  style,
  scrollRef: externalRef,
  onRangeChange,
}) {
  const innerRef = useRef(null);
  const scrollRef = externalRef || innerRef;
  const cols = useGridColumns(scrollRef, { minColWidth, gap });
  const rows = Math.ceil(items.length / Math.max(1, cols));
  const estimate = clampInt(rowHeight, 24, 168) + clampInt(gap, 0, 12);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan: clampInt(overscanRows, 0, 2),
  });
  const virtualRows = virtualizer.getVirtualItems();

  // Scroll hooks (infinite pages, "load more") read this instead of the DOM.
  useEffect(() => {
    if (!onRangeChange) return;
    const last = virtualRows.length ? virtualRows[virtualRows.length - 1].index : 0;
    onRangeChange({ first: virtualRows.length ? virtualRows[0].index : 0, last, rows, items: items.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualRows.length, virtualRows.length ? virtualRows[virtualRows.length - 1].index : -1, rows, items.length]);

  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', minHeight: 0, position: 'relative', ...style }}>
      {items.length === 0 ? empty : (
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualRows.map((row) => {
            const start = row.index * cols;
            const slice = items.slice(start, start + cols);
            return (
              <div
                key={row.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: rowHeight,
                  transform: `translateY(${row.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap,
                }}
              >
                {slice.map((item, i) => renderItem(item, start + i))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Virtualized single-column list (the compact media/video list views). */
export function VirtualMediaList({
  items = [],
  rowHeight = 56,
  gap = 6,
  overscan = 6,
  renderItem,
  empty = null,
  style,
}) {
  const scrollRef = useRef(null);
  const estimate = clampInt(rowHeight, 20, 56) + clampInt(gap, 0, 6);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan: clampInt(overscan, 0, 6),
  });
  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', minHeight: 0, position: 'relative', ...style }}>
      {items.length === 0 ? empty : (
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: rowHeight, transform: `translateY(${row.start}px)` }}
            >
              {renderItem(items[row.index], row.index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The still a tile should show: the cached poster the background pipeline wrote
 * for a video, or the 480px derivative the main process keeps for an image.
 * `''` means "no still exists" — the tile then falls back to one budgeted
 * video element instead of a broken image.
 */
export const posterFor = (asset) => {
  if (!asset) return '';
  if (asset.thumb) return asset.thumb;
  const url = asset.url || asset.value || '';
  if (!url) return '';
  const kind = asset.kind || 'image';
  if (kind === 'video' || kind === 'audio') return '';
  return thumbUrl(url, kind);
};

/**
 * Media tile face. NEVER renders a <video> — that is the whole point: a grid of
 * 3000 clips is a grid of 3000 small JPEGs, and only the player (the booth
 * stage, the wall) ever gets a media element.
 */
export function MediaPoster({ asset, url, kind = 'image', alt = '', rounded = 0, style, imgStyle }) {
  const [failed, setFailed] = useState(false);
  const [triedOriginal, setTriedOriginal] = useState(false);
  const mediaUrl = url || (asset && (asset.url || asset.value)) || '';
  const mediaKind = (asset && asset.kind) || kind;
  const still = useMemo(() => (asset ? posterFor(asset) : (mediaUrl ? thumbUrl(mediaUrl, mediaKind) : '')), [asset, mediaUrl, mediaKind]);
  // A thumb that fails to decode still has the picture itself behind it: retry
  // ONCE with the original file before showing a black tile. Clips skip this
  // (a full clip rendered by <img> cannot work) and go to their budgeted
  // element instead.
  const src = failed ? '' : (triedOriginal ? mediaUrl : still);
  useEffect(() => { setFailed(false); setTriedOriginal(false); }, [still, mediaUrl]);

  const box = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#000',
    borderRadius: rounded,
    ...style,
  };

  if (src && !failed) {
    return (
      <div style={box}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            if (mediaKind !== 'video' && mediaUrl && mediaUrl !== src && !triedOriginal) setTriedOriginal(true);
            else setFailed(true);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...imgStyle }}
        />
      </div>
    );
  }

  // Clip with no still yet (just imported, or a codec the poster pipeline could
  // not open): a placeholder, never a decoder. The poster lands in the
  // background and App patches this row, so the tile becomes a JPEG without a
  // library refetch — and mounting a 3000-clip grid still costs zero pipelines.
  if (mediaKind === 'video' && mediaUrl) {
    return (
      <div style={box}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b78' }}>
          <Film size={rounded ? 13 : 18} strokeWidth={1.6} />
        </div>
      </div>
    );
  }

  return <div style={box} />;
}
