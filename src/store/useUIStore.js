import { create } from 'zustand';

// UI STORE
//
// Non-persistent panel and dialog visibility. Kept apart from the document and
// presentation stores so opening a modal never re-renders canvas subscribers
// and changing a slide never re-renders panel chrome.

const bool = (value, prev) => {
  const next = typeof value === 'function' ? value(prev) : value;
  return !!next;
};

export const useUIStore = create((set) => ({
  leftOpen: true,
  rightOpen: true,
  showHotkeys: false,
  showSettings: false,
  showMoreMenu: false,
  showOutputMonitor: false,

  setLeftOpen: (value) => set((state) => ({ leftOpen: bool(value, state.leftOpen) })),
  setRightOpen: (value) => set((state) => ({ rightOpen: bool(value, state.rightOpen) })),
  setShowHotkeys: (value) => set((state) => ({ showHotkeys: bool(value, state.showHotkeys) })),
  setShowSettings: (value) => set((state) => ({ showSettings: bool(value, state.showSettings) })),
  setShowMoreMenu: (value) => set((state) => ({ showMoreMenu: bool(value, state.showMoreMenu) })),
  setShowOutputMonitor: (value) => set((state) => ({ showOutputMonitor: bool(value, state.showOutputMonitor) })),
}));
