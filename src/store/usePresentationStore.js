import { create } from 'zustand';

// PRESENTATION STORE
//
// Live playback state only. It is intentionally separate from the song editor:
// selecting a box, zooming the canvas or dragging a slide MUST NOT touch what
// is on the wall. The projector/stage/broadcast adapters still receive the
// plain payloads built in App — this store only tracks which presentation item
// is active and how far through the deck playback is.

export const usePresentationStore = create((set) => ({
  // { deck, index } while a deck is on air, null otherwise.
  activePresentation: null,
  // Reported to the UI; never used as the source of the slide payload.
  playback: { status: 'idle', index: 0, total: 0 },

  // Functional updater supported: App already uses setActivePresentation(ap => ...)
  // for deck edits while a deck is live.
  setActivePresentation: (value) => set((state) => {
    const next = typeof value === 'function' ? value(state.activePresentation) : value;
    if (!next || !next.deck) {
      return { activePresentation: null, playback: { status: 'idle', index: 0, total: 0 } };
    }
    const total = (next.deck.slides || []).length;
    const index = Math.max(0, Math.min(total - 1, Number(next.index) || 0));
    return {
      activePresentation: { ...next, index },
      playback: { status: total ? 'live' : 'idle', index, total },
    };
  }),

  setSlideIndex: (index) => set((state) => {
    if (!state.activePresentation) return state;
    const total = (state.activePresentation.deck.slides || []).length;
    const next = Math.max(0, Math.min(total - 1, Number(index) || 0));
    return {
      activePresentation: { ...state.activePresentation, index: next },
      playback: { ...state.playback, index: next, total },
    };
  }),

  stopPresentation: () => set({
    activePresentation: null,
    playback: { status: 'idle', index: 0, total: 0 },
  }),
}));
