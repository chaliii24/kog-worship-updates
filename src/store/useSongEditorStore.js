import { create } from 'zustand';

// SONG EDITOR STORE
//
// Owns the authoritative EDITING document, the selection that is meaningful
// only while editing, and the undo/redo history. It deliberately does not own
// Konva nodes, DOM nodes, pointer coordinates or viewport zoom: those are
// transient interaction state and live in the canvas component.
//
// `setDocument` is the single write path used by App's existing patch helpers
// (updateCue, setSongBackground, the title fields, ...). That keeps one source
// of truth instead of adding a second copy of the song next to React state.

export const EMPTY_SONG = {
  id: null,
  title: '',
  artist: '',
  category: 'Worship',
  cues: [],
};

const HISTORY_GAP_MS = 1200;
const HISTORY_MAX = 150;

const clampCueIndex = (doc, index) => {
  const max = Math.max(0, ((doc && doc.cues) || []).length - 1);
  const n = Math.trunc(Number(index));
  if (!Number.isFinite(n)) return 0;
  // -1 is the title slide in the existing editor model; keep it valid.
  return Math.max(-1, Math.min(n, max));
};

const resolve = (value, prev) => (typeof value === 'function' ? value(prev) : value);

export const useSongEditorStore = create((set, get) => ({
  document: EMPTY_SONG,
  // Snapshot the document is compared against for dirty state. App keeps its
  // own crash-recovery baseline; this one drives the editor's save status.
  baseline: EMPTY_SONG,

  // Transient editor selection (never persisted with the song).
  editorCueIdx: 0,
  activeObjectIndex: 0,
  selectedElementIds: [],
  activeTool: 'select',

  history: [],
  future: [],
  // Timestamp of the last burst boundary. Kept in the store (not React state)
  // so history behaves the same under StrictMode double renders.
  historyAt: 0,

  // Interaction grouping. A drag/resize increments depth on start; every write
  // during the gesture lands in the document but only ONE undo entry is pushed
  // on end.
  gestureDepth: 0,
  gestureBase: null,

  isDirty: false,
  saveStatus: 'idle', // idle | saved | unsaved | saving | error
  // Document identity at the moment a save starts. If it is still the same
  // object when the write finishes, the saved snapshot can be adopted as the
  // authoritative document (normalisation must not read back as "dirty").
  savingDocument: null,

  /**
   * The one commit path. Accepts a value or a functional updater, exactly like
   * React's setState, so existing call sites did not need rewriting.
   *
   * opts.history:
   *   'record' (default) — normal edit, grouped into 1.2s bursts
   *   'break'            — force a new history entry (Apply, bulk writes)
   *   'none'             — no history entry (undo/redo, baseline reload)
   */
  setDocument: (value, opts = {}) => {
    const state = get();
    const prev = state.document;
    const next = resolve(value, prev);
    if (!next || next === prev) return prev;

    const now = Date.now();
    let history = state.history;
    let future = state.future;
    let historyAt = state.historyAt;

    if (opts.history === 'none') {
      // Deliberately silent (undo/redo or loading a saved baseline).
    } else if (state.gestureDepth > 0) {
      // Committed on endGesture — never one entry per pointer move.
    } else if (opts.history === 'break' || now - state.historyAt > HISTORY_GAP_MS) {
      history = [...state.history, prev].slice(-HISTORY_MAX);
      future = [];
      historyAt = now;
    } else {
      // Same typing/gesture burst: the entry recorded at the start already
      // covers this change.
      future = [];
    }

    set({
      document: next,
      history,
      future,
      historyAt,
      isDirty: next !== state.baseline,
      saveStatus: next === state.baseline ? 'saved' : 'unsaved',
    });
    return next;
  },

  /** Replace the whole document and start a fresh history (open/load/save-new). */
  loadDocument: (doc, opts = {}) => {
    const next = doc || EMPTY_SONG;
    const baseline = opts.baseline !== undefined ? opts.baseline : next;
    set({
      document: next,
      baseline,
      history: [],
      future: [],
      // 0 means the first edit after a load gets its own undo entry.
      historyAt: 0,
      gestureDepth: 0,
      gestureBase: null,
      savingDocument: null,
      editorCueIdx: clampCueIndex(next, opts.editorCueIdx ?? 0),
      activeObjectIndex: 0,
      selectedElementIds: [],
      activeTool: 'select',
      isDirty: next !== baseline,
      saveStatus: next === baseline ? 'saved' : 'unsaved',
    });
    return next;
  },

  /** Force the next edit into its own undo step (Apply/bulk actions). */
  breakHistory: () => set({ historyAt: 0 }),

  beginGesture: () => {
    const state = get();
    if (state.gestureDepth > 0) {
      set({ gestureDepth: state.gestureDepth + 1 });
      return;
    }
    set({ gestureDepth: 1, gestureBase: state.document });
  },

  endGesture: () => {
    const state = get();
    if (state.gestureDepth <= 1) {
      const base = state.gestureBase;
      const doc = state.document;
      if (base && base !== doc) {
        set({
          gestureDepth: 0,
          gestureBase: null,
          history: [...state.history, base].slice(-HISTORY_MAX),
          future: [],
          historyAt: Date.now(),
          isDirty: doc !== state.baseline,
          saveStatus: doc === state.baseline ? 'saved' : 'unsaved',
        });
      } else {
        set({ gestureDepth: 0, gestureBase: null });
      }
      return;
    }
    set({ gestureDepth: state.gestureDepth - 1 });
  },

  undo: () => {
    const state = get();
    if (!state.history.length) return null;
    const prev = state.history[state.history.length - 1];
    set({
      document: prev,
      history: state.history.slice(0, -1),
      future: [...state.future, state.document].slice(-HISTORY_MAX),
      historyAt: 0,
      gestureDepth: 0,
      gestureBase: null,
      isDirty: prev !== state.baseline,
      saveStatus: prev === state.baseline ? 'saved' : 'unsaved',
      editorCueIdx: clampCueIndex(prev, state.editorCueIdx),
      activeObjectIndex: 0,
      selectedElementIds: [],
    });
    return prev;
  },

  redo: () => {
    const state = get();
    if (!state.future.length) return null;
    const next = state.future[state.future.length - 1];
    set({
      document: next,
      history: [...state.history, state.document].slice(-HISTORY_MAX),
      future: state.future.slice(0, -1),
      historyAt: 0,
      gestureDepth: 0,
      gestureBase: null,
      isDirty: next !== state.baseline,
      saveStatus: next === state.baseline ? 'saved' : 'unsaved',
      editorCueIdx: clampCueIndex(next, state.editorCueIdx),
      activeObjectIndex: 0,
      selectedElementIds: [],
    });
    return next;
  },

  markSaving: () => set({ saveStatus: 'saving', savingDocument: get().document }),
  markSaved: (doc) => {
    const state = get();
    const savedDoc = doc || state.document;
    // If the user did not edit while the IPC write was in flight, adopt the
    // exact normalised snapshot that reached SQLite. Otherwise keep the newer
    // document and leave it dirty, but still move the baseline to the save.
    const unchanged = state.savingDocument == null || state.document === state.savingDocument;
    const document = unchanged ? savedDoc : state.document;
    set({
      document,
      baseline: savedDoc,
      savingDocument: null,
      isDirty: document !== savedDoc,
      saveStatus: document === savedDoc ? 'saved' : 'unsaved',
    });
  },
  markSaveError: () => set({ saveStatus: 'error', savingDocument: null }),

  setEditorCueIdx: (value) => {
    const state = get();
    const next = clampCueIndex(state.document, resolve(value, state.editorCueIdx));
    if (next === state.editorCueIdx) return;
    // A different slide means a different set of boxes.
    set({ editorCueIdx: next, activeObjectIndex: 0, selectedElementIds: [] });
  },

  setActiveObjectIndex: (value) => {
    const state = get();
    const next = Math.max(0, Math.trunc(Number(resolve(value, state.activeObjectIndex)) || 0));
    if (next === state.activeObjectIndex) return;
    set({ activeObjectIndex: next, selectedElementIds: [] });
  },

  selectObject: (index, id) => {
    const next = Math.max(0, Math.trunc(Number(index)) || 0);
    set({
      activeObjectIndex: next,
      selectedElementIds: id == null ? [] : [id],
    });
  },

  setSelectedElementIds: (ids) => set({ selectedElementIds: Array.isArray(ids) ? [...ids] : [] }),
  setActiveTool: (tool) => set({ activeTool: String(tool || 'select') }),

  // ---- document operations (shared by UI and regression tests) ------------
  addCue: (cue, at) => {
    const doc = get().document;
    const cues = [...(doc.cues || [])];
    const index = at == null ? cues.length : Math.max(0, Math.min(cues.length, Math.trunc(Number(at))));
    cues.splice(index, 0, cue || { label: 'Verse 1', text: '', box: { x: 80, y: 100, w: 1120, h: 480 } });
    return get().setDocument({ ...doc, cues });
  },

  updateCueAt: (index, patch) => {
    const doc = get().document;
    const cues = [...(doc.cues || [])];
    if (!cues[index] || !patch) return doc;
    cues[index] = { ...cues[index], ...patch };
    return get().setDocument({ ...doc, cues });
  },

  deleteCueAt: (index) => {
    const doc = get().document;
    if (!(doc.cues || [])[index]) return doc;
    const cues = (doc.cues || []).filter((_, i) => i !== index);
    return get().setDocument({ ...doc, cues });
  },

  duplicateCueAt: (index) => {
    const doc = get().document;
    const cues = [...(doc.cues || [])];
    if (!cues[index]) return doc;
    const copy = { ...cues[index] };
    delete copy.id;
    cues.splice(index + 1, 0, copy);
    return get().setDocument({ ...doc, cues });
  },

  reorderCue: (from, to) => {
    const doc = get().document;
    const cues = [...(doc.cues || [])];
    if (from == null || to == null || from === to) return doc;
    if (!cues[from] || to < 0 || to >= cues.length) return doc;
    const [moved] = cues.splice(from, 1);
    cues.splice(to, 0, moved);
    return get().setDocument({ ...doc, cues });
  },
}));
