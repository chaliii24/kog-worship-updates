import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Plus, Search, Star, Clock, Folder, Download, Upload, Trash2, Edit3, Image as ImageIcon, Video, AlignLeft, AlignCenter, AlignRight, Sparkles, CheckSquare, Square, Wand2, Monitor, Calendar, ArrowUp, ArrowDown, FileText, SkipBack, SkipForward, Cpu, LayoutGrid, Link2, Save, Copy, ChevronUp, ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, HelpCircle, Network, Menu, Eye, EyeOff, Lock, Unlock, GripVertical, ChevronLeft, ChevronRight, Type, PenLine, BringToFront, SendToBack, CornerUpLeft, MonitorPlay, Zap } from 'lucide-react';
import logoImage from './assets/logo.png';
import { getTheme } from './lib/theme';
import { TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, cssSpeed } from './lib/constants';
import { applyCaseTransform, renderLyricsLayout, LyricsBlock, SlideTextLayers, cueLyricStyle, growBoxToText, FONT_SIZE_MAX, DEFAULT_LYRIC_SIZE, fitBoxToText, fitParsedCue, liftBox, ghostLayerOf } from './lib/lyrics';
import { textObjectLayers, patchTextObject, moveTextObject, addTextObject, removeTextObject, duplicateTextObject } from './lib/songTextObjects';
import { reflowCuesToLines } from './lib/splitReflow.js';
import { parseSongBlocks, splitCuesByLines } from '../electron/songParse.js';
import { extractCcli } from '../electron/ccliReport.js';
import { LiveBadge, TileVideo, TileCanvas, BackgroundVideo, LiveVideo, OverlayFace, overlayOnAir } from './lib/perf';
import SplashScreen from './components/SplashScreen';
import WelcomeScreen from './components/WelcomeScreen';
import SettingsModal from './components/SettingsModal';
import StageDisplay from './components/StageDisplay';
import { loadVideoList } from './components/VideoLibrarySidebar';
import ProjectorDisplay from './components/ProjectorDisplay';
import TopHeader from './components/TopHeader';
import LiveOutputPanel from './components/LiveOutputPanel';
import LeftSidebar from './components/LeftSidebar';
import CenterWorkspace from './components/CenterWorkspace';
import WorkspaceBoundary from './components/WorkspaceBoundary';
import SongEditorModal from './components/SongEditorModal';
import { Toaster, toast } from './untitledui/components/ui/toast';
import NewSongPrompt from './components/NewSongPrompt';
import PresentationModal from './components/PresentationModal';
import PresentationSlide from './components/PresentationSlide';
import ShowBuilderModal from './components/ShowBuilderModal';
import { parseMedleyDef, flattenMedley, medleySongIds, medleyTitleId, basePartLabel } from './lib/medley';
import { mediaLabel } from './lib/backgrounds';
import { audioEngine } from './lib/audioEngine';
import { resolveArrangementFlow } from './lib/arrangement';
import { DEFAULT_STAGE_CFG } from './lib/stageLayout';
import { SONG_DRAFT_KEY, SERVICE_DRAFT_KEY, detectFirstRunBoot } from './lib/firstRun';
import { clampBpm, normalizeTimeSignature, MIN_BPM, MAX_BPM } from './lib/metronome';
import { loadIconTheme, saveIconTheme } from './lib/icons';
import CustomSlideModal from './components/modals/CustomSlideModal';
import { defaultCustomSlideData, normalizeCustomSlideStyle } from './lib/customSlides';
import MedleyModal from './components/MedleyModal';
import ScriptureMediaPicker from './components/ScriptureMediaPicker';
import ArrangementModal from './components/ArrangementModal';
import TemplateNameModal from './components/modals/TemplateNameModal';
import HotkeysModal from './components/modals/HotkeysModal';
import OutputsMonitorModal from './components/modals/OutputsMonitorModal';
import ConfirmModal from './components/modals/ConfirmModal';
import ScriptureSectionModal from './components/modals/ScriptureSectionModal';import { DEFAULT_COUNTDOWN, nextTargetTime, animatedPresetOf } from './components/CountdownFace';
import CountdownPreview, { countdownProof } from './components/CountdownPreview';
import { sanitizeDrawStroke, pushDrawStroke } from './lib/draw.js';
import { DrawOverlay } from './components/DrawOverlay.jsx';
import AnimatedBg from './components/AnimatedBg';
import ScriptureRef from './components/ScriptureRef.jsx';
import TitleCardChrome from './components/TitleCardChrome.jsx';
import { DEFAULT_SCRIPTURE_TEMPLATE, scriptureTemplateOf, scriptureLyricFor, stripScriptureRef, scriptureRefPos } from './lib/scriptureTemplates';
import { AppProvider } from './context/AppContext';
import { useSongEditorStore } from './store/useSongEditorStore';
import { usePresentationStore } from './store/usePresentationStore';
import { useServiceStore } from './store/useServiceStore';
import { useUIStore } from './store/useUIStore';
import { normalizeSongGeometry, needsLegacyGeometryMigration } from './lib/slideGeometry';

const DEFAULT_OUTPUTS = [
  { id: 'projector', name: 'Lyrics Projector', role: 'lyrics', displayId: null, enabled: false, resolution: 'native', aspect: 'auto' },
  { id: 'stage', name: 'Stage Monitor', role: 'stage', displayId: null, enabled: false, resolution: 'native', aspect: 'auto' }
];

// One physical display may own at most one output. Old saved layouts can carry
// two entries assigned to the same screen (the UI enforces this going forward,
// but a layout written by an older build must not resurrect two fullscreen
// windows stacked on top of each other). Keep the first, clear the rest.
const dedupeOutputDisplays = (list) => {
  const used = new Set();
  return (Array.isArray(list) ? list : []).map((o) => {
    if (!o) return o;
    const d = o.displayId;
    if (d == null || d === '' || d === 'preview') return o;
    const key = String(d);
    if (used.has(key)) return { ...o, displayId: null, enabled: false };
    used.add(key);
    return o;
  });
};

// One-time auto-fit migration. Older builds wrote `aspect: "16:9"` on every
// output, so a 4:3 projector or an ultrawide LED wall got pillarboxed bars
// even though the window itself filled the screen. Native-resolution outputs
// from those builds are switched to `auto` (fill the physical display) once;
// after this flag is set, a deliberate 16:9 / 4:3 choice is never touched.
const AUTO_FIT_MIGRATION_KEY = 'kog_output_autofit_v1';
const migrateOutputAutoFit = (list) => (Array.isArray(list) ? list : []).map((o) => {
  if (!o) return o;
  const nativeRes = (o.resolution || 'native') === 'native';
  const namedRatio = /^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?$/.test(String(o.aspect || ''));
  return nativeRes && namedRatio ? { ...o, aspect: 'auto' } : o;
});

// Single-slot crash recovery for the Song Editor and the SERVICE PLAN: the
// draft keys live in lib/firstRun.js (a brand-new profile must ignore them),
// while the recovery code below owns when they are written and cleared.

// Brand-new installs open CLEAN — see lib/firstRun.js for the full policy.
// Cached for the life of this window: StrictMode mounts the component twice
// and a second pass must not see the marker it just wrote and flip to false.
let firstRunBootCache = null;
const isFirstRunBoot = () => {
  if (firstRunBootCache !== null) return firstRunBootCache;
  try {
    firstRunBootCache = detectFirstRunBoot(localStorage);
  } catch {
    firstRunBootCache = false;
  }
  return firstRunBootCache;
};

// The plan the console opens on — and the one "Start Blank" must produce.
// Built fresh each call so a reset never shares the startup object.
const blankServicePlan = () => ({
  id: null,
  name: 'Sunday Service',
  date: new Date().toISOString().split('T')[0],
  items: [],
});

export default function App() {
  const isOutputWindow = typeof window !== 'undefined' && (
    window.location.hash.includes('/output/') ||
    window.location.hash.includes('/projector') ||
    window.location.hash.includes('/stage')
  );
  // Only the operator decides the first-run state. Output windows share this
  // localStorage and must never consume the one-time blank boot.
  const firstRunRef = useRef(null);
  if (firstRunRef.current === null) firstRunRef.current = isOutputWindow ? false : isFirstRunBoot();
  const firstRunBoot = firstRunRef.current;
  const [isProjector, setIsProjector] = useState(false);
  const [isStage, setIsStage] = useState(false);
  const [isOutput, setIsOutput] = useState(false);
  const [outputRole, setOutputRole] = useState('lyrics');
  // Per-output screen hardware pushed by main: rotation, custom pixel
  // viewport, edge blending. Only an output window ever receives it.
  const [outputCfg, setOutputCfg] = useState(null);
  // LED-WALL LIFT — canvas px (of the shared 1280×720 output space) to raise
  // every lyric box by, so a band standing in front of the bottom of a wall
  // never covers the words. Live output decision, not a song edit: it rides
  // the projector and the operator's own monitor, never the editing canvas.
  const [lyricLift, setLyricLiftState] = useState(0);
  // Raising the lyrics is a live decision, but it belongs on its own channel:
  // pushing the slide again would replay its transition over the band. Only
  // the console ever tells main, and only main ever tells the outputs.
  const setLyricLift = (px) => {
    const n = Math.max(0, Math.min(720, Math.round(Number(px) || 0)));
    setLyricLiftState(n);
    if (isOutputWindow || !window.require) return;
    try { window.require('electron').ipcRenderer.send('update-lyric-lift', n); } catch {}
  };
  const [showSplash, setShowSplash] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSlide, setCurrentSlide] = useState({ title: "KOG Worship", text: "", style: {}, timestamp: Date.now() });

  // Monotonic live stamps: lyric/monitor layers key on `timestamp`, and two
  // fires inside the same millisecond reused the DOM — no exit, no enter, no
  // transition replay (a hard cut that could also strand a stale slide).
  const liveStampRef = useRef(0);
  const liveStamp = () => {
    const n = Date.now();
    liveStampRef.current = Math.max(n, liveStampRef.current + 1);
    return liveStampRef.current;
  };

  const [activeTab, setActiveTab] = useState('library'); // 'library' or 'service'
  const [themeDark, setThemeDark] = useState(() => {    // Read + apply synchronously so there's no dark flash on boot for
    // light-mode users; the effect below keeps it in sync afterwards.
    let dark = true;
    try {
      const saved = localStorage.getItem('kog-theme');
      if (saved) dark = saved === 'dark';
    } catch { /* keep default */ }
    try {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      // Untitled UI reads its dark token set from a `.dark-mode` class on
      // <html> — mirror the app's theme flag onto it (variables only; only
      // components that use those tokens see any difference).
      document.documentElement.classList.toggle('dark-mode', !!dark);
    } catch { /* non-browser context */ }
    return dark;
  });
  useEffect(() => {
    try { localStorage.setItem('kog-theme', themeDark ? 'dark' : 'light'); } catch { /* ignore */ }
    document.documentElement.dataset.theme = themeDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = themeDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark-mode', !!themeDark);
  }, [themeDark]);
  // Prism Slate icon theme (Settings → Appearance): 'prism' gives every
  // function-kind of icon its own hue; 'mono' is the old quiet behavior.
  const [iconTheme, setIconThemeState] = useState(loadIconTheme);
  const setIconTheme = (v) => {
    const clean = v === 'mono' ? 'mono' : 'prism';
    setIconThemeState(clean);
    saveIconTheme(clean);
  };
  // Cross-fade the flip: .theme-fading (index.css) enables a short
  // background/border/color transition on every element, but ONLY while a
  // toggle is in flight — zero transition overhead any other time. The
  // double rAF guarantees the browser paints the transition-enabled style
  // with the OLD colors first, so the recolor actually animates instead of
  // snapping (class + value change in one recalc = no transition).
  const themeFadeTimerRef = useRef(null);
  const themeFadeRafRef = useRef(0);
  const toggleTheme = () => {
    const root = document.documentElement;
    if (themeFadeTimerRef.current) { clearTimeout(themeFadeTimerRef.current); themeFadeTimerRef.current = null; }
    // A double-click used to queue two rAF chains, each flipping the theme —
    // ending where it started (looking broken). One flight at a time.
    if (themeFadeRafRef.current) { cancelAnimationFrame(themeFadeRafRef.current); themeFadeRafRef.current = 0; }
    root.classList.add('theme-fading');
    themeFadeRafRef.current = requestAnimationFrame(() => requestAnimationFrame(() => {
      themeFadeRafRef.current = 0;
      setThemeDark(v => !v);
      themeFadeTimerRef.current = setTimeout(() => {
        root.classList.remove('theme-fading');
        themeFadeTimerRef.current = null;
      }, 340);
    }));
  };
  const [songs, setSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showsQuery, setShowsQuery] = useState('');
  const [showsCollapsed, setShowsCollapsed] = useState(false);
  const [songsCollapsed, setSongsCollapsed] = useState(false);
  const [serviceDragOver, setServiceDragOver] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  // Every category present in the table — the chip row. Kept separate from
  // `songs` because the songs query only ever returns ONE category (the one it
  // filtered to), so the chips could never be derived from that list.
  const [songCategories, setSongCategories] = useState([]);
  const [activeSong, setActiveSong] = useState(null);
  const [activeCue, setActiveCue] = useState(null);

  // Panel visibility lives in the UI store: it is interaction state, never part
  // of a song/service document, and separate subscriptions keep a panel toggle
  // from re-rendering canvas consumers.
  const leftOpen = useUIStore((s) => s.leftOpen);
  const setLeftOpen = useUIStore((s) => s.setLeftOpen);
  const rightOpen = useUIStore((s) => s.rightOpen);
  const setRightOpen = useUIStore((s) => s.setRightOpen);
  const showHotkeys = useUIStore((s) => s.showHotkeys);
  const setShowHotkeys = useUIStore((s) => s.setShowHotkeys);
  const showSettings = useUIStore((s) => s.showSettings);
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const [aboutStatus, setAboutStatus] = useState('');
  const [updateReady, setUpdateReady] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null);
  // Which release the updater is working with (set on available/downloaded,
  // reused for the installing flag + the complete banner after relaunch).
  const [updateVersion, setUpdateVersion] = useState(null);
  const showOutputMonitor = useUIStore((s) => s.showOutputMonitor);
  const setShowOutputMonitor = useUIStore((s) => s.setShowOutputMonitor);
  const showMoreMenu = useUIStore((s) => s.showMoreMenu);
  const setShowMoreMenu = useUIStore((s) => s.setShowMoreMenu);
  // Audience message overlay (ProPresenter-Messages style): declared up here
  // with the other UI state because the global keydown effect below reads it
  // in its deps — anything it references must already be initialized when
  // that effect call runs, or the render dies on TDZ (appValue TDZ rule).
  const [liveOverlay, setLiveOverlay] = useState(null);
  const lastOverlayRef = useRef(null); // draft mirror for the M hotkey
  // Fresh-read mirror: sendStageData and the expiry below run from effects
  // with potentially stale closures — the ref is always current.
  const liveOverlayRef = useRef(null);
  liveOverlayRef.current = liveOverlay;

  // Remote draw-mode strokes (phone highlighter): session-only, never
  // persisted — like the message overlay, but with its own channel and no
  // timeout. Cleared by Clear All (blackout means black), kept across slide
  // changes so a highlight survives while preaching on one slide.
  const [drawStrokes, setDrawStrokes] = useState([]);
  const drawStampRef = useRef(0);
  const pushDraw = (strokes) => {
    if (isOutputWindow || !window.require) return;
    try {
      window.require('electron').ipcRenderer.send('update-live-draw',
        strokes && strokes.length ? { strokes, stamp: drawStampRef.current || Date.now() } : null);
    } catch {}
  };
  const setDrawStrokesLive = (next) => {
    drawStampRef.current = Date.now();
    setDrawStrokes(next);
    pushDraw(next);
  };
  // One implementation of each draw operation, shared by the PHONE's remote
  // commands and the DESKTOP telestrator. Both ends must sanitize identically
  // and reach the outputs through the same push, or a stroke drawn on the
  // console would land where a stroke drawn on the phone never could.
  const addDrawStroke = (raw) => {
    const s = sanitizeDrawStroke(raw);
    if (!s) return false;
    setDrawStrokes((prev) => {
      const next = pushDrawStroke(prev, s);
      drawStampRef.current = Date.now();
      pushDraw(next);
      return next;
    });
    return true;
  };
  const undoDrawStroke = () => {
    setDrawStrokes((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      drawStampRef.current = Date.now();
      pushDraw(next);
      return next;
    });
  };
  const clearDrawStrokes = () => setDrawStrokesLive([]);
  // In-app confirm/alert dialog (replaces native confirm/alert, which steal focus in Electron)
  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmResolverRef = useRef(null);
  // Scripture "Add to Playlist" destination picker: { reference, count, verses,
  // sections, initialTitle } while the modal is open, null otherwise.
  const [bibleQueueModal, setBibleQueueModal] = useState(null);

  const resolveConfirmDialog = (ok) => {
    setConfirmDialog(null);
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    resolve?.(ok);
  };

  const appConfirm = (message, opts = {}) => new Promise(resolve => {
    confirmResolverRef.current = resolve;
    setConfirmDialog({
      mode: 'confirm',
      title: opts.title || 'Confirm',
      message,
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
    });
  });

  const appAlert = (message, opts = {}) => new Promise(resolve => {
    confirmResolverRef.current = resolve;
    setConfirmDialog({
      mode: 'alert',
      title: opts.title || 'Notice',
      message,
      confirmLabel: opts.confirmLabel || 'OK',
    });
  });

  // Three-way choice (shares the confirm dialog + resolver): resolves true
  // (confirm), 'extra' (third action) or false (cancel). Used by the quit
  // gate: Quit Without Saving / Save & Quit / Cancel.
  const appChoice = (message, opts = {}) => new Promise(resolve => {
    confirmResolverRef.current = resolve;
    setConfirmDialog({
      mode: 'confirm',
      title: opts.title || 'Confirm',
      message,
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      extraLabel: opts.extraLabel || null,
    });
  });

  // New Command-Center Layout State
  const [dockTab, setDockTab] = useState('shows'); // shows | live | sermon | media | videos | audio | countdown | scripture | outputs | functions
  const [scheduleView, setScheduleView] = useState('schedule'); // 'schedule' | 'songs'
  const [rightTab, setRightTab] = useState('overlay'); // 'overlay' | 'groups'

  // Dock tool state
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [scriptureBgLibrary, setScriptureBgLibrary] = useState(() => {
    try { const s = localStorage.getItem('scriptureBgLibrary'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [libraryStats, setLibraryStats] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null); // { url, name }
  const [audioVolume, setAudioVolume] = useState(1);

  // Offline Bible Library (G-Presenter style Scripture Browser)
  const [bibleLib, setBibleLib] = useState([]); // { abbrev, name, lang, code, installed, size, books }
  const [bibleTrans, setBibleTrans] = useState('kjv');
  const [bibleBooks, setBibleBooks] = useState(null); // { translation, books: [{nr,name,chapters,testament}], totalChapters }
  const [bibleSel, setBibleSel] = useState({ bookIndex: 1, bookName: 'Genesis', chapter: 1, totalChapters: 50 });
  const [bibleChapter, setBibleChapter] = useState(null); // { book, chapter, verses: [...], prev, next, totalChapters }
  const [bibleDL, setBibleDL] = useState({ abbrev: null, progress: 0, running: false });
  const [bibleLibQuery, setBibleLibQuery] = useState('');
  const [bibleLibLoading, setBibleLibLoading] = useState(false);
  const [bibleTransOpen, setBibleTransOpen] = useState(false); // translation selector flyout
  const [bibleHelpOpen, setBibleHelpOpen] = useState(false); // verse interaction help tooltip
  const [bibleMedia, setBibleMedia] = useState(() => {
    try { const s = localStorage.getItem('bibleMedia'); return s ? JSON.parse(s) : null; } catch { return null; }
  }); // { type: 'image'|'video', value, name } background for scripture slides
  const [bibleMediaOpen, setBibleMediaOpen] = useState(false);
  // The background every scripture gets, assigned ONCE from existing media and
  // remembered across restarts — so a passage added from the sidebar or the
  // Scripture tab always carries artwork. bibleMedia above is only the live
  // override for the current session; this is the floor beneath it.
  const [scriptureDefault, setScriptureDefault] = useState(() => {
    try { const s = localStorage.getItem('scriptureDefaultMedia'); return s ? JSON.parse(s) : null; } catch { return null; }
  }); // { type: 'image'|'video', value, name }
  const [bibleTestament, setBibleTestament] = useState('all'); // all | ot | nt
  const [bibleBookQuery, setBibleBookQuery] = useState('');
  const [bibleRef, setBibleRef] = useState('');
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState(null);
  const [bibleSelVerses, setBibleSelVerses] = useState([]); // verse numbers highlighted in current chapter
  const [bibleFocusedVerse, setBibleFocusedVerse] = useState(null); // verse number with keyboard focus for arrow nav
  const [bibleFmt, setBibleFmt] = useState(() => {
    // The template is a durable operator preference (where the words sit on
    // the wall), so it survives a restart; the rest of the format is a
    // session choice, like before.
    let template = DEFAULT_SCRIPTURE_TEMPLATE;
    try {
      const saved = localStorage.getItem('kog_scripture_template');
      if (saved && scriptureTemplateOf(saved).id === saved) template = saved;
    } catch { /* storage unavailable */ }
    return { bold: false, caps: false, layout: 'number', font: null, color: null, mark: null, template };
  }); // number | plain | sentence; font/color null = stage style; mark null = highlight off; template = scripture layout
  const bibleLastVerseRef = useRef(null); // anchor verse for Shift+Click range selection
  // Remote Bible panel (LAN control phone): request/response state that rides
  // the normal snapshot down. Shape: { catalog:[{abbrev,name,code,books}],
  // abbrev, books, passage:{book,chapter,verses}, results:[...], error, stamp }.
  // Null until the phone asks — snapshots stay lean for everyone else.
  const [bibleRemote, setBibleRemote] = useState(null);
  const touchBibleRemote = (patch) => setBibleRemote((prev) => ({ ...(prev || {}), ...patch, stamp: Date.now() }));

  // New Show builder + per-slide live timer
  const [showModalOpen, setShowModalOpen] = useState(false);
  const [showBuilder, setShowBuilder] = useState(null);
  const [builderSongQuery, setBuilderSongQuery] = useState({});
  const [builderSrcSongQuery, setBuilderSrcSongQuery] = useState('');
  const [builderSheet, setBuilderSheet] = useState(null); // { secIdx, itemIdx } of selected service-order item
  const [builderTargetSecId, setBuilderTargetSecId] = useState(null); // section that Add Song/Slide/Media goes into
  const [builderDensity, setBuilderDensity] = useState(3); // 1-4 grid density
  // Slide-grid density in the Center Workspace (1-4 columns) — same control
  // the Show Builder has. Sticky across sessions like the other console prefs.
  const [gridDensity, setGridDensity] = useState(() => {
    try {
      const n = Number(localStorage.getItem('kog_grid_density'));
      return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n) : 2;
    } catch { return 2; }
  });
  useEffect(() => { try { localStorage.setItem('kog_grid_density', String(gridDensity)); } catch { /* storage unavailable */ } }, [gridDensity]);
  // Scripture template is a durable layout preference, so it outlives the
  // session; the other format toggles stay per-session like before.
  useEffect(() => { try { localStorage.setItem('kog_scripture_template', String(bibleFmt.template || 'classic')); } catch { /* storage unavailable */ } }, [bibleFmt.template]);
  const [builderTileIdx, setBuilderTileIdx] = useState(0); // active tile within selected item
  const [builderCollapsed, setBuilderCollapsed] = useState([]);
  const [builderRehearse, setBuilderRehearse] = useState(false);
  const [builderActiveSong, setBuilderActiveSong] = useState(null);
  const [builderSongDetails, setBuilderSongDetails] = useState({});
  const selectedServiceId = useServiceStore((s) => s.selectedServiceId);
  const setSelectedServiceId = useServiceStore((s) => s.setSelectedServiceId);
  const [slideTimer, setSlideTimer] = useState({ start: null, elapsed: 0, duration: 0 });

  // Countdown timer (bottom-dock tab). Config persists in localStorage; the
  // live stamp never does — a reboot must never resurrect a stale countdown.
  const [countdown, setCountdown] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kog_countdown') || 'null');
      if (raw && typeof raw === 'object') return { ...DEFAULT_COUNTDOWN, ...raw, live: null };
    } catch {}
    return { ...DEFAULT_COUNTDOWN };
  });
  useEffect(() => {
    try {
      const { live, ...cfg } = countdown || {};
      localStorage.setItem('kog_countdown', JSON.stringify(cfg));
    } catch {}
  }, [countdown]);

  // Countdown media templates: named snapshots of the MEDIA setup only (kind,
  // images, video, framing, watermark) — titles/durations stay weekly. One
  // source for the desktop panel, the mobile snapshot, and phone apply.
  const [cdTemplates, setCdTemplates] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kog_countdown_templates') || '[]');
      return Array.isArray(raw) ? raw.filter((t) => t && t.name && t.bgMedia) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('kog_countdown_templates', JSON.stringify(cdTemplates || [])); } catch {}
  }, [cdTemplates]);

  // Service Plan State comes from the service store. The list, the open plan
  // and the saved-service id are one authoritative set; every existing setter
  // call in App keeps working through the stable store actions.
  const services = useServiceStore((s) => s.services);
  const setServices = useServiceStore((s) => s.setServices);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [showTemplateNameModal, setShowTemplateNameModal] = useState(false);
  const [templateNameValue, setTemplateNameValue] = useState('');
  const activeService = useServiceStore((s) => s.activeService);
  const setActiveService = useServiceStore((s) => s.setActiveService);
  const [customSlideModal, setCustomSlideModal] = useState(false);
  // Which service row is being edited (null = adding a new slide). Keeping the
  // index here means the modal's state lives only in the modal's form, and the
  // service order stays the single source of truth.
  const [customSlideEditIdx, setCustomSlideEditIdx] = useState(null);
  const [newSlideData, setNewSlideData] = useState(() => defaultCustomSlideData());

  // Sermon / Presentation builder state
  const [presentations, setPresentations] = useState([]);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  // Live presentation (deck + slide index) is playback state, kept isolated
  // from the editor so canvas selection/zoom can never alter the wall.
  const activePresentation = usePresentationStore((s) => s.activePresentation);
  const setActivePresentation = usePresentationStore((s) => s.setActivePresentation);
  const presentationNextRef = useRef(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Left-sidebar tab (Service Order / Shows / Songs) lives in App, not in the
  // sidebar: the console unmounts while the song-editor page is open, and this
  // keeps the operator on the tab they left.
  const [viewTab, setViewTab] = useState('order');
  const [editorMode, setEditorMode] = useState('manual');
  const [newSongPromptOpen, setNewSongPromptOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  // The editing document, selection index and history are owned by the song
  // editor store. `setEditingSong` keeps the exact React-setState contract
  // (value or functional updater) so every existing patch helper is unchanged.
  const editingSong = useSongEditorStore((s) => s.document);
  const setEditingSong = useSongEditorStore((s) => s.setDocument);
  const [linesPerSlide, setLinesPerSlide] = useState(4);

  // Video booth playlist, shared by the center player and the system
  // left-sidebar library (cue/queue from either side, one source of truth).
  const [videoList, setVideoList] = useState(loadVideoList);
  const [videoIdx, setVideoIdx] = useState(0);

  // G-Presenter style editor state
  const editorCueIdx = useSongEditorStore((s) => s.editorCueIdx);
  const setEditorCueIdx = useSongEditorStore((s) => s.setEditorCueIdx);
  const [canvasEdit, setCanvasEdit] = useState(false);
  const [boxDrag, setBoxDrag] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [dragFrom, setDragFrom] = useState(null);
  const [showSlideProps, setShowSlideProps] = useState(false);
  const [serviceCollapsed, setServiceCollapsed] = useState([]);
  const [serviceAddMenu, setServiceAddMenu] = useState(null); // null | 'song' | 'media' | 'local'
  const [serviceTargetTitle, setServiceTargetTitle] = useState(null); // section header title that Add* inserts into
  const [serviceSongQuery, setServiceSongQuery] = useState('');
  const [serviceMediaPicker, setServiceMediaPicker] = useState(false); // browse media already in the app instead of re-uploading
  const canvasWrapRef = useRef(null);
  const editAreaRef = useRef(null);
  const [outputAspectState, setOutputAspectState] = useState(() => { try { return localStorage.getItem('kog_output_aspect') || '16:9'; } catch { return '16:9'; } });
  // Sanitized: a corrupt localStorage value or a bad IPC push used to throw
  // inside render (undefined.replace) and take the whole console down.
  const outputAspect = typeof outputAspectState === 'string' && outputAspectState.includes(':') ? outputAspectState : '16:9';
  const setOutputAspect = (v) => {
    const clean = typeof v === 'string' && v.includes(':') ? v : '16:9';
    setOutputAspectState(clean);
    try { localStorage.setItem('kog_output_aspect', clean); } catch {}
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-output-aspect', clean);
    }
  };
  const [previewScale, setPreviewScale] = useState(1);
  const previewObsRef = useRef(null);
  const setPreviewWrapRef = useCallback((el) => {
    if (previewObsRef.current) { previewObsRef.current.disconnect(); previewObsRef.current = null; }
    if (el) {
      const update = () => setPreviewScale(el.clientWidth / 1280);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      previewObsRef.current = ro;
    }
  }, []);
  
  // AI Selection & Status
  const [aiStatus, setAiStatus] = useState(null);

  const [stageStyle, setStageStyle] = useState({
    fontFamily: 'system-ui, sans-serif',
    fontSize: '4.5rem',
    fontColor: '#ffffff',
    textAlign: 'center',
    backgroundType: 'color', 
    backgroundValue: '#000000',
    transition: 'fade', 
    speed: '400ms'      
  });

  const [displays, setDisplays] = useState([
    { id: 1, name: 'Main Projector', content: null },
    { id: 2, name: 'Side Projectors', content: null }
  ]);
  const [targetedDisplays, setTargetedDisplays] = useState([1, 2]); 
  const [outputDisplays, setOutputDisplays] = useState([]);
  const [outputs, setOutputs] = useState(DEFAULT_OUTPUTS);
  const outputsReadyRef = useRef(false);
  // Projection layers per output id ('kog' | 'passthrough'), mirrored from
  // main's output-layer events (own toggles + global F1/F2). The sermon tab
  // reads "any lyrics output beneath the slideshow" off this.
  const [outputLayers, setOutputLayers] = useState({});
  // Slideshow sermon bridge state (Microsoft PowerPoint, WPS Presentation or
  // LibreOffice Impress — main.js picks the engine). `passthrough` mirrors
  // outputLayers for the lyrics outputs so panel, hotkeys and arrows agree
  // on who is visible.
  const [sermon, setSermon] = useState({ loaded: false, file: null, title: '', total: 0, index: 0, error: null, busy: false, displayLabel: '', passthrough: false, provider: '' });
  const lastBibleRef = useRef(null);
  const liveBibleRef = useRef(null);
  const liveBibleSrcRef = useRef(null);
  // The global key handler below is registered once per dependency change, so
  // it would otherwise capture a stale `clearLyrics` (and with it the last
  // background it saw). Read it through a ref that every render re-points.
  const clearLyricsRef = useRef(null);
  // Phone (LAN remote) bridge: the command listener registers once, so it reads
  // the current handlers through a ref that every render re-points. Same idea,
  // for the same reason.
  const mobileCmdsRef = useRef({});
  // Last stage payload sent to the stage window, reused for the singer view.
  const stageSnapshotRef = useRef(null);
  // Mirror of that payload as STATE, so the Stage tab preview re-renders on
  // every cue instead of reading a ref that React does not watch.
  const [stageSnap, setStageSnap] = useState(null);
  // Stage display config (layout preset, clock, alert, traffic light, flow
  // tracker, chords, contrast) — owned by the console, edited in the Stage
  // dock tab, persisted, and pushed to the stage window over the
  // `update-stage-config` channel (main caches the last value + fans it out).
  const [stageCfg, setStageCfg] = useState(() => {
    // First launch: no carried-over tempo. The drummer phone keeps the BPM
    // area blank until a song (or the operator) actually sets one.
    if (firstRunBoot) return { ...DEFAULT_STAGE_CFG, bpm: null, metronome: false };
    try { return { ...DEFAULT_STAGE_CFG, ...(JSON.parse(localStorage.getItem('kog_stage_cfg')) || {}) }; }
    catch { return { ...DEFAULT_STAGE_CFG }; }
  });
  useEffect(() => {
    try {
      // Transport is owned by each drummer phone, so nothing here is
      // session-scoped. Drop the legacy `metronomeRunning` key if an older
      // build left it in localStorage.
      const persisted = { ...stageCfg };
      delete persisted.metronomeRunning;
      localStorage.setItem('kog_stage_cfg', JSON.stringify(persisted));
    } catch { /* quota */ }
  }, [stageCfg]);
  // Stage WINDOW side: the feed received from main ({ cfg, flow, chord }).
  // Output windows never push — they only render what arrives here.
  const [stageFeed, setStageFeed] = useState(null);
  // Per-song tempo popup (Stage tab): opened on service-order load (effect
  // below) and re-targeted to the current song whenever it changes.
  const [stageBpmPopup, setStageBpmPopup] = useState(null); // { songId, title } | null
  // Lets main.js ask for a fresh snapshot when the LAN server (re)starts,
  // instead of phones waiting for the next cue to happen.
  const pushMobileRef = useRef(null);

  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    let alive = true;
    ipcRenderer.invoke('list-displays')
      .then((list) => { if (alive) setOutputDisplays(Array.isArray(list) ? list : []); })
      .catch(() => {});
    const onChanged = (_e, list) => setOutputDisplays(Array.isArray(list) ? list : []);
    ipcRenderer.on('displays-changed', onChanged);
    return () => { alive = false; ipcRenderer.removeListener('displays-changed', onChanged); };
  }, []);

  // Restore the saved output layout on startup. Guarded: an output toggled
  // in the milliseconds before this resolves must NOT be overwritten by the
  // saved copy (lost toggle), so the load only lands on a still-default list.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('outputs-load')
      .then((saved) => {
        if (!Array.isArray(saved) || !saved.length) return;
        // Run the one-time auto-fit migration OUTSIDE the state updater (the
        // updater must stay pure — React may invoke it twice in dev).
        let rows = saved;
        try {
          if (localStorage.getItem(AUTO_FIT_MIGRATION_KEY) !== '1') {
            rows = migrateOutputAutoFit(saved);
            localStorage.setItem(AUTO_FIT_MIGRATION_KEY, '1');
          }
        } catch { /* storage unavailable: keep the saved rows as-is */ }
        const normalized = rows.map(o => ({ ...o, resolution: o.resolution || 'native', aspect: o.aspect || 'auto', enabled: false }));
        setOutputs((prev) => {
          const touched = prev.some(o => o.enabled || (o.displayId !== null && o.displayId !== undefined && o.displayId !== ''));
          if (touched) return prev;
          return dedupeOutputDisplays(normalized);
        });
      })
      .catch(() => {})
      .finally(() => { outputsReadyRef.current = true; });
  }, []);

  // LED-WALL LIFT: push it to the output windows on its own channel. It is
  // deliberately NOT part of the slide payload — re-firing the slide to move
  // the lyrics would replay the song's transition mid-song, and the band
  // would see every lift as a flicker. main fans it out to every lyrics
  // output, and (like the slide) caches it so an output opened later starts
  // already lifted rather than dropping back to the floor.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    window.require('electron').ipcRenderer.send('update-lyric-lift', lyricLift);
  }, [lyricLift, isOutputWindow]);

  // Keep main's window registry in sync with the output configuration. Gated
  // on outputsReady: the mount sync used to push DEFAULT_OUTPUTS to main
  // before the saved layout arrived (flash of wrong registry).
  useEffect(() => {
    if (isOutputWindow || !window.require || !outputsReadyRef.current) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('outputs-sync', outputs);
    ipcRenderer.send('outputs-save', outputs);
  }, [outputs]);

  // An output can close itself — pressing Esc while a frameless fullscreen
  // output is covering the console (no monitor to assign it to). Without
  // this, `enabled` would still read as running, the button would lie, and
  // the next sync would reopen the window Esc just got the operator out of.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onClosed = (_e, id) => setOutputs(prev => prev.map(o => (o.id === id ? { ...o, enabled: false } : o)));
    ipcRenderer.on('output-closed', onClosed);
    return () => ipcRenderer.removeListener('output-closed', onClosed);
  }, []);

  // A display can vanish mid-service (projector unplugged, dock removed).
  // main re-binds the running output to a free screen and reports the actual
  // id here, so the console's picker and the saved layout tell the truth.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onReassigned = (_e, payload) => {
      if (!payload || payload.id == null || payload.displayId == null) return;
      setOutputs(prev => prev.map(o => (
        o.id === payload.id ? { ...o, displayId: payload.displayId } : o
      )));
    };
    ipcRenderer.on('output-display-reassigned', onReassigned);
    return () => ipcRenderer.removeListener('output-display-reassigned', onReassigned);
  }, []);

  // Layer echo from main (own toggles + global F1/F2): mirror per-output so
  // the sermon tab always reports who is actually visible.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onLayer = (_e, { id, layer }) => {
      if (id == null) return;
      setOutputLayers(prev => ({ ...prev, [id]: layer === 'passthrough' ? 'passthrough' : 'kog' }));
    };
    ipcRenderer.on('output-layer', onLayer);
    return () => ipcRenderer.removeListener('output-layer', onLayer);
  }, []);

  // Sermon passthrough follows the real windows: true when any running lyrics
  // output sits beneath (passthrough), whatever set it — tab, F1/F2, monitor.
  useEffect(() => {
    if (isOutputWindow) return;
    const anyPass = (outputs || []).some(o => o.role === 'lyrics' && o.enabled && (outputLayers[o.id] || 'kog') === 'passthrough');
    setSermon(prev => (prev.passthrough === anyPass ? prev : { ...prev, passthrough: anyPass }));
  }, [outputs, outputLayers, isOutputWindow]);

  // Sync projector output's aspect to global state so output windows receive it
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const projector = outputs.find(o => o.id === 'projector');
    // Auto / Fill is resolved per-display by the output window itself; only a
    // named ratio belongs in the global composition state.
    const named = /^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?$/.test(String(projector?.aspect || ''));
    if (named && projector.aspect !== outputAspect) {
      setOutputAspect(projector.aspect);
    }
  }, [outputs]);

  // Grow-only box repair for stored songs, applied wherever a song crosses
  // from the database into the app. A cue saved by an older build can carry a
  // box that no longer fits its text (the pre-measurement fitter under-counted
  // wraps on wide faces), and the renderer's shrink pass then quietly draws
  // 120 as ~100 — Size says 120, the canvas shows something smaller, and only
  // retyping used to snap it back. Same repair as typing (growBoxToText), run
  // on load: any cue whose text needs more height gets its box fitted at the
  // cue's OWN size. Nothing ever shrinks (hand-placed boxes keep their
  // center); fill mode and locked cues are left alone — the box drives size
  // there / the operator pinned that box.
  const repairSongBoxes = (song) => {
    if (!song || !Array.isArray(song.cues)) return song;
    const fixCue = (c) => {
      // Versioned cues have already been migrated. Re-fitting them on every
      // open was silently changing saved h (and then re-saving it), which is
      // exactly the cumulative geometry drift this refactor removes.
      if (!needsLegacyGeometryMigration(c)) return c;
      const box = growBoxToText(c.text || '', cueLyricStyle(c), c.box);
      return box === c.box ? c : { ...c, box };
    };
    const out = { ...song, cues: song.cues.map(fixCue) };
    if (song.title_cue) {
      const t = fixCue(song.title_cue);
      if (t !== song.title_cue) out.title_cue = t;
    }
    return out;
  };

  // --- SONG EDITOR DRAFT GUARD ---------------------------------------------
  // The editor's draft IS editingSong and nothing but Save ever writes it. A
  // Cancel, a stray window close or a crash used to take the whole design job
  // with it — no prompt, no recovery. Two halves, both keyed off one baseline:
  //
  //   DIRTY CHECK     — baseline the song the moment the editor opens, and
  //                      re-baseline it the moment a Save lands, so every close
  //                      path can ask the same way the service plan already
  //                      does.
  //   CRASH RECOVERY  — while the draft differs from that baseline it is
  //                      mirrored to localStorage, and cleared the instant the
  //                      work is safe: on Save, or when the operator explicitly
  //                      discards.
  //
  // Both read REFS, never render-time state, so the window-X gate — a handler
  // subscribed once and potentially long stale — always sees the current song.
  const songSnapRef = useRef(null);
  // Generation counter: bumping it invalidates mirror writes already sitting in
  // the debounce timer. Without this, a keystroke 600ms before Save could fire
  // its write during the save's `await` — AFTER clearSongDraft had removed the
  // entry — and resurrect a draft for work that is already safely in the DB.
  const songDraftGenRef = useRef(0);
  const editingSongRef = useRef(editingSong);
  editingSongRef.current = editingSong; // assigned every render: always current
  const songSnapOf = (song) => { try { return JSON.stringify(song ?? null); } catch { return null; } };
  const isSongDraftDirty = () => songSnapRef.current !== null && songSnapOf(editingSongRef.current) !== songSnapRef.current;
  // Dropping the draft only when it belongs to the song being closed: opening
  // song B must never delete a recovery draft still waiting on song A.
  const clearSongDraft = () => {
    songDraftGenRef.current += 1; // kill any mirror write already scheduled
    try {
      const raw = localStorage.getItem(SONG_DRAFT_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && (stored.id ?? null) === (editingSongRef.current?.id ?? null)) {
        localStorage.removeItem(SONG_DRAFT_KEY);
      }
    } catch { /* an unreadable draft is not worth failing a close over */ }
    // Re-baseline as well: a mirror timer scheduled a moment before a Save
    // would otherwise still see a dirty song and write the draft straight back
    // after this removed it.
    songSnapRef.current = songSnapOf(editingSongRef.current);
  };

  // Baseline on close (null = nothing to compare) and as a fallback for any
  // open path that didn't go through openEditorOn. It deliberately does NOT
  // re-baseline on every song change: openEditorOn sets the baseline itself,
  // because a recovered draft must be compared against the PRISTINE song —
  // a recovery is unsaved work by definition, and treating it as clean would
  // let "open it to take a look, then close" quietly destroy it.
  useEffect(() => {
    if (!isEditorOpen) { songSnapRef.current = null; return; }
    if (songSnapRef.current === null) songSnapRef.current = songSnapOf(editingSongRef.current);
  }, [isEditorOpen]);

  // Mirror to localStorage, debounced — this fires on every keystroke and
  // stringifying a 60-cue song per keypress is not free. Skipped entirely while
  // the draft is clean, so opening an untouched song never overwrites a real
  // recovery draft with a copy of nothing.
  useEffect(() => {
    if (!isEditorOpen || !editingSong) return;
    const gen = songDraftGenRef.current;
    const t = setTimeout(() => {
      if (gen !== songDraftGenRef.current) return; // cleared while we waited
      if (songSnapOf(editingSong) === songSnapRef.current) return;
      try {
        localStorage.setItem(SONG_DRAFT_KEY, JSON.stringify({
          at: Date.now(),
          id: editingSong.id ?? null,
          mode: editorMode,
          raw: rawPasteText || '',
          song: editingSong,
        }));
      } catch { /* quota: recovery is best-effort and must never throw */ }
    }, 700);
    return () => clearTimeout(t);
  }, [editingSong, isEditorOpen, editorMode, rawPasteText]);

  // Open the editor on `song` — or on the draft a previous session left behind,
  // when that draft was for THIS song. A draft belonging to any other song is
  // left untouched.
  const openEditorOn = (song, mode = 'manual') => {
    let draft = null;
    try {
      const raw = localStorage.getItem(SONG_DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { draft = null; }
    const recovered = !!(draft && typeof draft === 'object' && draft.song && (draft.id ?? null) === (song?.id ?? null));
    const pristine = repairSongBoxes({ ...song, cues: song.cues || [] });
    // A fresh open starts a fresh undo history. The baseline stays the PRISTINE
    // song even when a recovery draft is loaded, so recovered work reads dirty.
    useSongEditorStore.getState().loadDocument(recovered ? draft.song : pristine, {
      baseline: pristine,
      editorCueIdx: 0,
    });
    setEditorMode(recovered && draft.mode === 'auto' ? 'auto' : mode);
    setRawPasteText(recovered && typeof draft.raw === 'string' ? draft.raw : '');
    // Baseline is ALWAYS the pristine song, never the recovered copy — so a
    // recovery lands in the editor reading as dirty and gets the same discard
    // prompt as any other unsaved work. Must be set before setIsEditorOpen,
    // because the open effect will not overwrite a baseline that's already set.
    songSnapRef.current = songSnapOf(pristine);
    setIsEditorOpen(true);
    if (recovered) {
      const at = Number(draft.at) || Date.now();
      // Untitled's toast is an object with .add(), not a callable — this is the
      // same shape every other notice in App uses.
      toast.add({
        type: 'info',
        title: 'Unsaved changes recovered',
        description: `Picked up from ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — Save to keep them.`,
      });
    }
  };

  const fetchSongs = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const [result, cats] = await Promise.all([
        ipcRenderer.invoke('db-get-songs', searchQuery, activeCategory),
        ipcRenderer.invoke('db-get-categories'),
      ]);
      setSongs(Array.isArray(result) ? result.map(repairSongBoxes) : result);
      // Chips ride along on every fetch rather than once on mount: a song saved
      // under a brand-new category gets its chip immediately, without a
      // restart, and every caller that refreshes songs already calls this.
      if (Array.isArray(cats)) setSongCategories(cats);
    }
  };

  const fetchServices = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-services');
      setServices(result);
    }
  };

  // Media loads are shared by three workspaces (Media, Audio, Videos) and are
  // kicked off again on every visit. A burst of tab clicks used to start a
  // query per visit and apply them out of order; this keeps ONE request in
  // flight and only lets the newest generation write state.
  const mediaFetchRef = useRef({ inflight: null, seq: 0 });

  const fetchMediaLibrary = async () => {
    if (!window.require) return;
    if (mediaFetchRef.current.inflight) return mediaFetchRef.current.inflight;
    const seq = ++mediaFetchRef.current.seq;
    let promise;
    promise = (async () => {
      try {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('db-get-media');
        if (seq === mediaFetchRef.current.seq) setMediaLibrary(result || []);
      } catch {}
      finally {
        if (mediaFetchRef.current.inflight === promise) mediaFetchRef.current.inflight = null;
      }
    })();
    mediaFetchRef.current.inflight = promise;
    return promise;
  };

  const fetchLibraryStats = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      setLibraryStats(await ipcRenderer.invoke('db-get-stats'));
    }
  };

  const fetchAppInfo = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      setAppInfo(await ipcRenderer.invoke('app-info'));
    }
  };

  const fetchTemplates = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-templates');
      setTemplates(result || []);
    }
  };

  const fetchPresentations = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-presentations');
      setPresentations(result || []);
    }
  };

  const openPresentationEditor = (deck) => {
    setEditingDeck(deck || { id: null, title: 'Untitled Presentation', slides: [] });
    setIsPresentationOpen(true);
  };

  const closePresentationEditor = () => {
    setIsPresentationOpen(false);
    setEditingDeck(null);
  };

  const openPresentation = async (id) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const details = await ipcRenderer.invoke('db-get-presentation', id);
    if (details) openPresentationEditor(details);
  };

  const savePresentationDeck = async (deck) => {
    if (!window.require) return null;
    const { ipcRenderer } = window.require('electron');
    const id = await ipcRenderer.invoke('db-save-presentation', deck);
    // Keep a live presentation's workspace grid in sync with edits.
    setActivePresentation(ap => (ap && ap.deck && id && ap.deck.id === id) ? { ...ap, deck: { ...ap.deck, ...deck } } : ap);
    await fetchPresentations();
    return id;
  };

  const deletePresentationDeck = async (id) => {
    if (!window.require || !id) return;
    // Destructive and unrecoverable — confirm first, and name the deck so the
    // operator knows which row the click landed on.
    const target = (presentations || []).find(p => p.id === id);
    const ok = await appConfirm(
      `Delete "${target?.title || 'this slideshow deck'}"? All ${target?.slideCount || 'its'} slides are removed from this device and cannot be recovered.`,
      { title: 'Delete slideshow deck', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-presentation', id);
    // A deleted deck must not keep navigating on the live output.
    setActivePresentation(ap => (ap && ap.deck && ap.deck.id === id) ? null : ap);
    await fetchPresentations();
  };

  // Presentation import. Two modes, because "look exactly like the original"
  // and "keep it editable" are opposite goals: images export each slide
  // through an installed slideshow app (PowerPoint, WPS or LibreOffice —
  // pixel-perfect, needs one of them installed), text unzips the file and
  // rebuilds the words in KOG styling. main.js falls back to text
  // automatically when no slideshow app is available.
  const importPowerPoint = async (mode) => {
    if (!window.require) return { ok: false, error: 'Only available inside the app.' };
    const { ipcRenderer } = window.require('electron');
    try {
      // No mode = main asks the user (as images / as text / cancel).
      return await ipcRenderer.invoke('pptx-import', mode ? { mode } : {});
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Import failed.' };
    }
  };

  const applyTemplate = async (templateId) => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    // A template REPLACES the working order — guard unsaved work first.
    if (serviceDirty) {
      const ok = await appConfirm(
        `Apply "${tpl.name || 'template'}"? Unsaved changes to "${activeService?.name || 'the service order'}" will be lost.`,
        { confirmLabel: 'Discard & Apply' }
      );
      if (!ok) return;
    }
    let items = [];
    try { items = JSON.parse(tpl.items_json || '[]'); } catch (_) { items = []; }
    setActiveService({ ...activeService, name: (tpl.name || '').replace(/ Template$/, ''), items: Array.isArray(items) ? items : [] });
  };

  const saveCurrentTemplate = () => {
    setTemplateNameValue((activeService.name || 'Service') + ' Template');
    setShowTemplateNameModal(true);
  };

  const confirmSaveTemplate = async () => {
    const name = (templateNameValue || '').trim();
    if (!name) { setShowTemplateNameModal(false); return; }
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-save-template', { name, items: activeService.items });
      fetchTemplates();
    }
    setShowTemplateNameModal(false);
  };

  const removeTemplate = async (templateId) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-delete-template', templateId);
      setSelectedTemplateId('');
      fetchTemplates();
    }
  };

  // Latest click wins. Selecting a song and staging a song's background both
  // fetch details over IPC, so a fast operator can start a second request
  // before the first lands — discard any result that isn't the newest one.
  const songLoadSeqRef = useRef(0);

  const selectSong = async (id) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const seq = ++songLoadSeqRef.current;
      const details = await ipcRenderer.invoke('db-get-song-details', id);
      if (seq !== songLoadSeqRef.current) return; // a newer click won
      setActiveSong(repairSongBoxes(details));
    }
  };

  const editSong = async (id) => {
    let song = null;
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      // Same latest-wins guard as selectSong: a fast double-click on Edit
      // must not land song A's cues in song B's editor (and then Save them
      // into song B).
      const seq = ++songLoadSeqRef.current;
      song = await ipcRenderer.invoke('db-get-song-details', id);
      if (seq !== songLoadSeqRef.current) return;
    }
    if (!song) return;
    openEditorOn(song, 'manual');
  };

  useEffect(() => {
    const hash = window.location.hash;
    const outputMatch = hash.match(/#\/output\/([^?]+)(?:\?role=([^&]+))?/);
    // Output windows are separate windows: they only ever see a slide when
    // the operator pushes a change. If one opens while a cue is already
    // live it would stay black until the next cue click — so after wiring
    // the listeners, pull the cached live state from main immediately.
    const pullLiveState = (wantStage) => {
      if (!window.require) return;
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('get-live-state')
        .then((state) => {
          const payload = wantStage ? state?.stage : state?.slide;
          if (payload) setCurrentSlide(payload);
          // Stage config feed (cfg + flow + chord chart) rides the same pull:
          // a stage window opened after the operator set things up starts
          // already dressed, not with factory defaults.
          if (wantStage && state?.config) setStageFeed(state.config);
          // Audience overlay: a lyrics window opened mid-message joins it.
          if (!wantStage && state && state.overlay !== undefined) setLiveOverlay(state.overlay || null);
          // Remote drawings: a lyrics window opened mid-highlight joins them.
          if (!wantStage && state && state.draw !== undefined) setDrawStrokes(Array.isArray(state.draw?.strokes) ? state.draw.strokes : []);
          // LED-wall lift: a lyrics window opened after the operator raised
          // the lyrics starts at the same height, not back on the floor.
          if (!wantStage && state && state.lift !== undefined) setLyricLift(Number(state.lift) || 0);
        })
        .catch(() => {});
    };
    if (hash.includes('/stage')) {
      setIsStage(true);
      setIsProjector(false);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-stage', (event, stageData) => {
          setCurrentSlide(stageData);
        });
        ipcRenderer.on('render-stage-config', (event, feed) => {
          setStageFeed(feed);
        });
      }
      pullLiveState(true);
    } else if (outputMatch) {
      const outputId = decodeURIComponent(outputMatch[1]);
      const outputRoleName = decodeURIComponent(outputMatch[2] || 'lyrics');
      setIsOutput(true);
      setOutputRole(outputRoleName);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-slide', (event, slideData) => {
          setCurrentSlide(slideData);
        });
        // Audience overlay rides its own channel (showing/clearing it never
        // touches the slide), merged at render time below.
        ipcRenderer.on('render-live-overlay', (_event, overlay) => {
          setLiveOverlay(overlay || null);
        });
        // Remote draw strokes ride their own channel too.
        ipcRenderer.on('render-live-draw', (_event, draw) => {
          setDrawStrokes(draw && Array.isArray(draw.strokes) ? draw.strokes : []);
        });
        // LED-wall lift: its own channel, so raising the lyrics mid-service
        // never re-fires the slide (and its transition) underneath them.
        ipcRenderer.on('render-lyric-lift', (_event, px) => {
          setLyricLift(Number(px) || 0);
        });
        ipcRenderer.on('render-live-stage', (event, stageData) => {
          setCurrentSlide(stageData);
        });
        // An output bound to the stage role renders StageDisplay too, so it
        // needs the config feed as well (main only ever sends to role=stage).
        ipcRenderer.on('render-stage-config', (event, feed) => {
          setStageFeed(feed);
        });
        // Screen hardware for THIS output (rotation / custom viewport /
        // edge blend). A push can land before this effect runs, so also
        // pull once on mount — same pattern as get-live-state above.
        // The pull is answered asynchronously: a LIVE push can arrive after
        // the request was read but before its reply lands. Applying that
        // older reply last would silently undo the newest setting, so count
        // pushes and ignore a reply once a newer one has arrived.
        let cfgSeq = 0;
        ipcRenderer.on('output-config', (_e, cfg) => {
          if (!cfg || cfg.id === outputId) {
            cfgSeq += 1;
            setOutputCfg(cfg);
          }
        });
        const requestSeq = cfgSeq;
        ipcRenderer.invoke('output-config-request', outputId)
          .then((cfg) => { if (cfg && cfgSeq === requestSeq) setOutputCfg(cfg); })
          .catch(() => {});
      }
      pullLiveState(outputRoleName === 'stage');
    } else if (hash.includes('/projector')) {
      setIsProjector(true);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-slide', (event, slideData) => {
          setCurrentSlide(slideData);
        });
        ipcRenderer.on('render-live-overlay', (_event, overlay) => {
          setLiveOverlay(overlay || null);
        });
        ipcRenderer.on('render-live-draw', (_event, draw) => {
          setDrawStrokes(draw && Array.isArray(draw.strokes) ? draw.strokes : []);
        });
        ipcRenderer.on('render-lyric-lift', (_event, px) => {
          setLyricLift(Number(px) || 0);
        });
      }
      pullLiveState(false);
    } else {
      const timer = setTimeout(() => setShowSplash(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Keep the projected aspect in sync across the operator + output windows
  useEffect(() => {
    if (!isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onAspect = (event, v) => setOutputAspectState(v);
    ipcRenderer.on('update-output-aspect', onAspect);
    return () => ipcRenderer.removeListener('update-output-aspect', onAspect);
  }, [isOutputWindow]);
 
  // Auto-updater event listeners (operator window only)
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onUpdateAvailable = (event, info) => { setUpdateVersion(info?.version || null); setAboutStatus(`Update available: v${info.version}`); setUpdateReady('available'); setUpdateProgress(null); };
    const onUpdateDownloaded = (event, info) => {
      setUpdateVersion(info?.version || null);
      setAboutStatus(`Update v${info.version} downloaded.`);
      setUpdateReady('downloaded');
      setUpdateProgress(null);
      // The automatic prompt: no modal digging, no manual app close. Sticky
      // 12s toast above everything (z-index beats the modals) whose button
      // installs immediately. Non-blocking, so a mid-service download never
      // yanks the operator out of the console.
      toast.add({
        title: `Update v${info.version} ready`,
        description: 'Restart now to install — outputs go black for a moment.',
        type: 'success',
        duration: 12000,
        actionProps: { children: 'Restart & Install', onClick: () => installUpdateVersion(info?.version || null) },
      });
    };
    const onUpdateError = (event, error) => { setAboutStatus(`Update error: ${error}`); setUpdateReady('error'); setUpdateProgress(null); };
    const onUpdateNotAvailable = (event, info) => { setAboutStatus(`You're up to date${appInfo?.version ? ` (v${appInfo.version})` : ''}.`); setUpdateReady('uptodate'); setUpdateProgress(null); };
    const onDownloadProgress = (event, progress) => { setUpdateProgress(progress); setUpdateReady('downloading'); setAboutStatus(`Downloading update — ${Math.round(progress.percent)}%`); };
    ipcRenderer.on('update-available', onUpdateAvailable);
    ipcRenderer.on('update-downloaded', onUpdateDownloaded);
    ipcRenderer.on('update-error', onUpdateError);
    ipcRenderer.on('update-not-available', onUpdateNotAvailable);
    ipcRenderer.on('update-download-progress', onDownloadProgress);
    return () => {
      ipcRenderer.removeListener('update-available', onUpdateAvailable);
      ipcRenderer.removeListener('update-downloaded', onUpdateDownloaded);
      ipcRenderer.removeListener('update-error', onUpdateError);
      ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable);
      ipcRenderer.removeListener('update-download-progress', onDownloadProgress);
    };
  }, [isOutputWindow]);
 
  // Post-install banner: the installer relaunches the app, so a flag written
  // before quitAndInstall is how this boot knows it IS the update. Version
  // mismatch (flag vs running build) means the install landed.
  useEffect(() => {
    const v = appInfo?.version;
    if (!v || isOutputWindow) return;
    let pending = null;
    try { pending = localStorage.getItem('kog_update_installing'); } catch {}
    if (!pending) return;
    try { localStorage.removeItem('kog_update_installing'); } catch {}
    if (pending !== v) {
      setUpdateVersion(pending);
      setUpdateReady('complete');
      setAboutStatus(`Update complete — KOG Worship v${v} is now running.`);
    }
  }, [appInfo?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full refresh when the category changes or the splash clears. Services /
  // templates / presentations don't depend on the search box at all.
  useEffect(() => {
    if (!isProjector && !showSplash && !isStage && !isOutputWindow) {
      fetchSongs();
      fetchServices();
      fetchTemplates();
      fetchPresentations();
      fetchAppInfo();
    }
  }, [activeCategory, showSplash]);

  // Debounced search: ONE IPC + SQLite round-trip after typing pauses instead
  // of one per keystroke (previously 5 IPC calls fired on every key press).
  useEffect(() => {
    if (isProjector || showSplash || isStage || isOutputWindow) return;
    // activeCategory rides along: typing a query then switching category
    // within 180ms used to fire the query against the OLD category.
    const t = setTimeout(fetchSongs, 180);
    return () => clearTimeout(t);
  }, [searchQuery, activeCategory]);

  // A chip can vanish under the operator: deleting the last song in "Christmas"
  // used to leave the filter parked on a category that no longer exists, with no
  // chip left to click off and a list that stays empty forever. Drop back to All
  // the moment the category leaves the table. Never resets before the list has
  // loaded — an empty array there just means "not fetched yet".
  useEffect(() => {
    if (!songCategories.length) return;
    if (activeCategory === 'All' || activeCategory === 'Favorites' || activeCategory === 'Recent') return;
    if (!songCategories.includes(activeCategory)) setActiveCategory('All');
  }, [songCategories, activeCategory]);

  useEffect(() => {
    try { localStorage.setItem('scriptureBgLibrary', JSON.stringify(scriptureBgLibrary.filter(p => !p.builtin))); } catch {}
  }, [scriptureBgLibrary]);

  // Seed the scripture background picker with the bundled stock photos/videos
  // (they ship inside the installer, so they exist on every machine).
  useEffect(() => {
    if (isProjector || isStage || isOutputWindow || !window.require) return;
    let alive = true;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('list-builtin-assets').then((res) => {
      if (!alive) return;
      const builtin = [...(res?.photos || []), ...(res?.videos || [])]
        .map(a => ({ type: a.kind, value: a.url, name: a.name, builtin: true }));
      if (!builtin.length) return;
      setScriptureBgLibrary(prev => {
        const seen = new Set(prev.map(p => p.value));
        const added = builtin.filter(b => !seen.has(b.value));
        return added.length ? [...added, ...prev] : prev;
      });
      // First run: adopt a bundled photo as the default so the very first
      // scripture added to a section already has artwork behind it. The picker
      // can swap it for anything else later.
      setScriptureDefault(prev => prev || builtin.find(b => b.type === 'image') || builtin[0] || null);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dockTab === 'media' || dockTab === 'audio' || dockTab === 'videos') fetchMediaLibrary();
    // Settings opens as a dialog now — warm every section's data as it opens
    // (stats, version, templates, Bible catalog) so rows never show stale
    // numbers from the last time it was visited.
    if (showSettings) { fetchLibraryStats(); fetchAppInfo(); fetchTemplates(); refreshBibleLib(); }
  }, [dockTab, showSettings]);

  useEffect(() => {
    try { localStorage.setItem('bibleMedia', JSON.stringify(bibleMedia)); } catch {}
  }, [bibleMedia]);

  useEffect(() => {
    try { localStorage.setItem('scriptureDefaultMedia', JSON.stringify(scriptureDefault)); } catch {}
  }, [scriptureDefault]);

  useEffect(() => {
    if (bibleMediaOpen) fetchMediaLibrary();
  }, [bibleMediaOpen]);

  const selectBibleMedia = (type, value, name) => applyScriptureBg(type && value ? { type, value, name } : null);

  // Everything that can be assigned as the default scripture background:
  // scripture uploads, the bundled stock art, plus whatever is already in the
  // Media dock — merged and de-duplicated by URL so nothing is offered twice.
  const scriptureDefaultOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (a) => {
      const type = (a && (a.type || a.kind)) || null;
      const value = (a && (a.value || a.url)) || null;
      if ((type !== 'image' && type !== 'video') || !value || seen.has(value)) return;
      seen.add(value);
      // Real name only — mediaLabel strips the "<timestamp>-<rand>-" upload
      // prefix so the pickers never show raw hashes.
      out.push({ value, label: mediaLabel(a.name, type), type, name: a.name || null });
    };
    (scriptureBgLibrary || []).forEach(push);
    (mediaLibrary || []).forEach(push);
    return out;
  }, [scriptureBgLibrary, mediaLibrary]);

  // Assigning the default from a picker. Stored in the same {type,value,name}
  // shape buildBiblePayload already consumes, so no conversion happens later.
  const assignScriptureDefault = (value) => {
    const hit = scriptureDefaultOptions.find(o => o.value === value);
    const bg = hit ? { type: hit.type, value: hit.value, name: hit.name } : null;
    setScriptureDefault(bg);
    // Apply it as well — the operator picked it to see it, and applyScriptureBg
    // re-fires a scripture slide that is already live so the output updates in
    // place instead of on the next push.
    applyScriptureBg(bg);
  };

  const importBibleMedia = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (url) {
      const item = { type: file.type.startsWith('video/') ? 'video' : 'image', value: url, name: file.name };
      setScriptureBgLibrary(prev => prev.some(p => p.value === url) ? prev : [...prev, item]);
      applyScriptureBg(item);
      fetchMediaLibrary();
    }
    if (e.target) e.target.value = '';
  };

  // Scripture media picker → bg. Three source shapes: a folder file
  // ({type,value,name} with a media://…/bf/… url served in place), an
  // already-imported library item (same shape), or an upload ({file}) that
  // lands in the library first. Picked items are remembered in
  // scriptureBgLibrary so they show up in "In the app" and the defaults.
  const chooseScriptureMedia = async (source, asDefault) => {
    if (!source) return;
    let bg = null;
    if (source.file) {
      const url = await persistMediaFile(source.file);
      if (!url) return;
      bg = { type: source.file.type.startsWith('video/') ? 'video' : 'image', value: url, name: source.file.name };
      fetchMediaLibrary();
    } else if (source.value && (source.type === 'image' || source.type === 'video')) {
      bg = { type: source.type, value: source.value, name: source.name || null };
    }
    if (!bg) return;
    setScriptureBgLibrary(prev => prev.some(p => p.value === bg.value) ? prev : [...prev, bg]);
    if (asDefault) setScriptureDefault(bg);
    // Apply it as well — the operator picked it to see it, and applyScriptureBg
    // re-fires a scripture slide that is already live so the output updates
    // in place instead of on the next push.
    applyScriptureBg(bg);
    setScripturePicker(null);
  };

  // --- MEDLEY BUILDER (Continuous Flow Mode) ---
  // A medley row links stanzas of secondary songs to the end of an anchor
  // song; slides flow anchor → link 1 → link 2 with no secondary titles.
  // The session lives in a ref (slides + songs + index): firing sets
  // activeSong/activeCue per slide through the normal paths, so tiles,
  // monitor, stage, mobile and Stop all keep working untouched.
  const medleyRef = useRef(null);
  const fireMedleySlideRef = useRef(null);

  const lookupMedleySong = (songs, songId) => {
    if (!songs || songId == null) return null;
    const get = songs instanceof Map ? ((k) => songs.get(k)) : ((k) => songs[k]);
    return get(songId) ?? get(String(songId)) ?? get(Number(songId)) ?? null;
  };

  const loadMedleySongs = async (ids) => {
    if (!window.require) return new Map();
    const { ipcRenderer } = window.require('electron');
    // Batch first (two queries for the whole set), singles as fallback.
    try {
      const arr = await ipcRenderer.invoke('db-get-songs-details', ids);
      if (Array.isArray(arr) && arr.length) {
        const m = new Map();
        for (const s of arr) {
          if (s) {
            const fixed = repairSongBoxes(s);
            m.set(fixed.id ?? s.id, fixed);
          }
        }
        return m;
      }
    } catch {}
    const m = new Map();
    for (const id of ids || []) {
      try {
        const d = await ipcRenderer.invoke('db-get-song-details', id);
        if (d) {
          const fixed = repairSongBoxes(d);
          m.set(fixed.id ?? id, fixed);
        }
      } catch {}
    }
    return m;
  };

  // Medley background rule: the whole flow wears the ANCHOR song's
  // background. A linked song's own video/image/color bg is replaced, and
  // its per-cue overrides are stripped (they'd pop mid-flow otherwise) —
  // explicit cue bgs on the ANCHOR still win, as before. If the anchor
  // itself is plain, every song keeps its own bg (no surprise blackout).
  // In-memory only: the session map is freshly loaded per Go, never written
  // back (edits save through editingSong), so the library is untouched.
  const applyMedleyAnchorBg = (songs, def) => {
    if (!songs || !(songs instanceof Map) || !def) return songs;
    const pick = (id) => songs.get(id) ?? songs.get(String(id)) ?? songs.get(Number(id)) ?? null;
    const anchor = pick(def.anchor.songId);
    if (!anchor || isPlainBg(anchor.bg_type, anchor.bg_value)) return songs;
    const { bg_type, bg_value } = anchor;
    for (const l of def.links || []) {
      for (const k of [l.songId, String(l.songId), Number(l.songId)]) {
        const s = songs.get(k);
        if (!s) continue;
        const stripCue = (c) => {
          if (!c || isPlainBg(c.bg_type, c.bg_value)) return c;
          const { bg_type: _t, bg_value: _v, ...rest } = c;
          return rest;
        };
        songs.set(k, {
          ...s,
          bg_type,
          bg_value,
          cues: Array.isArray(s.cues) ? s.cues.map(stripCue) : s.cues,
          ...(s.title_cue ? { title_cue: stripCue(s.title_cue) } : null),
        });
      }
    }
    return songs;
  };

  const fireMedleySlide = (session, index) => {
    const slide = session.slides[index];
    if (!slide) return false;
    const song = lookupMedleySong(session.songs, slide.songId);
    if (!song) return false;
    session.index = index;
    medleyRef.current = session;
    setActiveSong(song);
    if (slide.kind === 'title') fireTitleLive(song, slide.cue);
    else fireCueLive(slide.cue, song);
    return true;
  };
  fireMedleySlideRef.current = fireMedleySlide;

  // The row's arrangement object, passed through to the editor (which
  // converts legacy cue-id orders into section flows itself).
  const arrangementOf = (item) => item?.meta?.arrangement ?? null;

  // ONE loader for every medley build (Go + save-while-live refresh): batch
  // songs, anchor background rule, unified flatten. Callers only re-point.
  const loadMedleyFlow = async (item, def) => {
    const songs = await loadMedleySongs(medleySongIds(def));
    applyMedleyAnchorBg(songs, def);
    // Anchor arrangement (v3 exact runs, v2 flows, or legacy order) resolves
    // against the LOADED anchor song, then rides in as a plain id list.
    let orders = null;
    const arr = item?.meta?.arrangement;
    if (arr && ((Array.isArray(arr.flow) && arr.flow.length) || (Array.isArray(arr.order) && arr.order.length))) {
      const pick = (id) => songs.get(id) ?? songs.get(String(id)) ?? songs.get(Number(id)) ?? null;
      const anchorSong = pick(def.anchor.songId);
      if (anchorSong) orders = { [String(def.anchor.songId)]: resolveArrangementFlow(anchorSong, arr) };
    }
    return { songs, slides: flattenMedley(def, songs, orders) };
  };

  // Live refresh: rebuild the on-air flow from a (possibly just-edited) row
  // WITHOUT refiring — position snaps to the current cue when it survives.
  const refreshLiveMedleyFlow = (rowId, item) => {
    const def = parseMedleyDef(item);
    if (!def) return;
    loadMedleyFlow(item, def).then(({ songs, slides }) => {
      if (!medleyRef.current || String(medleyRef.current.itemId) !== String(rowId)) return;
      if (!slides.length) return;
      const prevIdx = medleyRef.current.index;
      const at = slides.findIndex(s => (s.cue ? s.cue.id : medleyTitleId(s.songId)) === activeCue?.id);
      medleyRef.current = { itemId: rowId, slides, songs, index: at > -1 ? at : Math.min(prevIdx, slides.length - 1) };
    }).catch(() => {});
  };

  const fireMedleyItemLive = async (item) => {
    const def = parseMedleyDef(item);
    if (!def) return;
    // Ground truth in devtools: what the flow was actually built from.
    try { console.info('[medley] go', JSON.stringify(def)); } catch {}
    const { songs, slides } = await loadMedleyFlow(item, def);
    if (!slides.length) {
      await appAlert('That medley has no slides — its songs may have been deleted.');
      return;
    }
    // Composition proof: per-song section breakdown of what was ACTUALLY
    // built (not what the modal displayed). One Go press settles every
    // "verses still appear" dispute on sight.
    try {
      const breakdown = {};
      for (const s of slides) {
        const k = `${s.songId}|${s.kind === 'title' ? '(title)' : basePartLabel(s.cue?.label)}`;
        breakdown[k] = (breakdown[k] || 0) + 1;
      }
      console.info('[medley] slides', slides.length, JSON.stringify(breakdown));
    } catch {}
    fireMedleySlide({ itemId: item.id, slides, songs, index: 0 }, 0);
    // Badge count follows reality even if songs changed since linking.
    if (item.slideCount !== slides.length) {
      const n = slides.length;
      setActiveService((prev) => ({
        ...prev,
        items: (prev?.items || []).map((it) => (it === item || it.id === item.id ? { ...it, slideCount: n } : it)),
      }));
    }
  };

  // Grid clicks inside a live medley flow: fire by FLOW index (the tile knows
  // its position), so jumping around never leaves the session.
  const fireMedleySlideAt = (index) => {
    const med = medleyRef.current;
    if (med && med.slides.length) fireMedleySlide(med, index);
  };

  // Shared tile-fire used by the song grid AND the sidebar Up Next card, so
  // both advance a flow identically (medley by flow index, everything else
  // by cue, title cards through the title path).
  const fireGridTile = (tile) => {
    if (!tile) return;
    if (tile.medIdx != null) fireMedleySlideAt(tile.medIdx);
    else if (tile.arrIdx != null) fireArrangementAt(tile.arrIdx);
    else if (tile.isTitle) fireTitleLive();
    else if (tile.cue) fireCueLive(tile.cue);
  };

  // --- SONG ARRANGEMENTS -------------------------------------------------
  // A service row can carry its own play order (item.meta.arrangement.order,
  // a list of cue ids, repeats allowed). The library song is never touched.
  // Session mirrors the medley one: set on Go, walked by the arrows, cleared
  // on Stop / anything-else-live. Grid clicks still fire directly — if the
  // clicked slide is in the order, the arrows continue from it.
  const arrangeRef = useRef(null); // { itemId, songId, order } or null

  // Cue objects in arrangement order for THIS song, or null when no session
  // (or a different song) is on air. Shape-agnostic: v3 exact section runs,
  // v2 name-only section flows and legacy cue-id orders all resolve here. Normalizes live: slides deleted
  // from the library since linking are skipped, never fatal.
  const resolvedArrangementCues = (song, arr) => {
    const byId = new Map((song?.cues || []).map((c) => [c.id, c]));
    return resolveArrangementFlow(song, arr).map((id) => byId.get(id)).filter(Boolean);
  };
  const arrangementForSong = (song) => {
    const a = arrangeRef.current;
    if (!a || !song || !sameSongId(a.songId, song.id)) return null;
    const ordered = resolvedArrangementCues(song, a.arr);
    return ordered.length ? ordered : null;
  };

  // Fire one exact step of the live arrangement. Repeats share a cue id, so
  // the session carries the POSITION as well — otherwise Next/Previous and
  // the live grid would always restart from the first occurrence.
  const fireArrangementAt = (index) => {
    const a = arrangeRef.current;
    if (!a) return false;
    const ordered = resolvedArrangementCues(activeSong, a.arr);
    const cue = ordered[index];
    if (!cue) return false;
    arrangeRef.current = { ...a, index, cueId: cue.id };
    fireCueLive(cue, null, index);
    return true;
  };

  // Position of the live cue in the custom order. The session index wins for
  // repeated sections; a foreign/direct fire falls back to id matching.
  const arrangementIndexOf = (ordered) => {
    if (!ordered) return -1;
    const a = arrangeRef.current;
    if (a && Number.isInteger(a.index) && ordered[a.index]?.id === a.cueId) return a.index;
    return ordered.findIndex((c) => c.id === activeCue?.id);
  };

  const [arrangementModal, setArrangementModal] = useState(null); // { songId, title, itemIdx, existing }
  // Declared here (not in the medley section below): the keyboard effect
  // above reads it in its dep array at render time — anything declared after
  // the effect is TDZ-dead on first render and whitescreens the app.
  const [medleyModal, setMedleyModal] = useState(null);
  // Scripture media popup: null | 'session' (live override now) | 'default'
  // (attaches to new scripture). Opened from the Bible popover and the Live
  // Output sidebar instead of the old hashed-name dropdowns.
  const [scripturePicker, setScripturePicker] = useState(null);

  const openArrangementForRow = (item, idx) => {
    if (!item) return;
    // UNIFIED: medley rows arrange their ANCHOR song (the flow follows it —
    // see loadMedleyFlow). Plain song rows arrange themselves.
    if (item.item_type === 'medley') {
      const def = parseMedleyDef(item);
      if (!def) return;
      setArrangementModal({
        songId: def.anchor.songId,
        title: item.title,
        itemIdx: idx,
        existing: arrangementOf(item),
        forAnchor: true,
      });
      return;
    }
    if (item.item_type !== 'song') return;
    setArrangementModal({
      songId: item.content,
      title: item.title,
      itemIdx: idx,
      existing: arrangementOf(item),
    });
  };

  // arr: v3 { flow:[{part, occurrence}], known, slideCount } | v2 flow |
  // legacy { order:[ids] } | null. The modal always saves v3; old rows keep
  // working untouched.
  const saveArrangement = ({ arr, summary }) => {
    const m = arrangementModal;
    if (!m) return;
    const rowId = activeService?.items?.[m.itemIdx]?.id ?? null;
    const hasArr = arr && ((Array.isArray(arr.flow) && arr.flow.length) || (Array.isArray(arr.order) && arr.order.length));
    const slideN = arr && Number(arr.slideCount) > 0 ? Number(arr.slideCount)
      : (Array.isArray(arr?.order) ? arr.order.length : (Array.isArray(arr?.flow) ? arr.flow.length : 0));
    // UNIFIED medley branch needs the row's next meta for the live rebuild.
    let nextMeta = null;
    setActiveService((prev) => {
      const items = [...(prev?.items || [])];
      if (m.itemIdx == null || m.itemIdx < 0 || m.itemIdx >= items.length) return prev;
      const cur = items[m.itemIdx] || {};
      const keepId = cur.id != null ? { id: cur.id } : {};
      const keepMeta = { ...(cur.meta || {}) };
      if (!hasArr) delete keepMeta.arrangement;
      else keepMeta.arrangement = arr;
      nextMeta = keepMeta;
      if (m.forAnchor) {
        // Medley anchor: the flow (links, subtitle, count) is untouched —
        // only the anchor's play order changes.
        items[m.itemIdx] = {
          ...cur, ...keepId, item_type: 'medley',
          ...(Object.keys(keepMeta).length ? { meta: keepMeta } : {}),
        };
        if (!Object.keys(keepMeta).length) delete items[m.itemIdx].meta;
      } else if (!hasArr) {
        // Removed: back to the song's own order.
        const s = (songs || []).find(x => sameSongId(x.id, m.songId));
        items[m.itemIdx] = {
          ...keepId, item_type: 'song', title: m.title,
          subtitle: `${s?.artist || 'Worship'} • Song`, content: m.songId,
          ...(Object.keys(keepMeta).length ? { meta: keepMeta } : {}),
        };
      } else {
        // Row subtitle previews the flow verbatim — what you see is what Go walks.
        items[m.itemIdx] = {
          ...keepId, item_type: 'song', title: m.title,
          subtitle: summary ? `Arranged · ${summary}` : 'Arranged song',
          content: m.songId, meta: keepMeta,
        };
      }
      return { ...prev, items };
    });
    setArrangementModal(null);
    // Live refresh: this row's song is on air RIGHT NOW — re-point the
    // session at the just-saved arrangement (no refire, output untouched).
    if (rowId != null && arrangeRef.current && String(arrangeRef.current.itemId) === String(rowId)) {
      if (!hasArr) arrangeRef.current = null;
      else arrangeRef.current = { ...arrangeRef.current, arr };
    }
    // UNIFIED live refresh: this medley's flow is on air — rebuild it with
    // the new anchor order (no refire, position preserved).
    if (m.forAnchor && rowId != null && medleyRef.current && String(medleyRef.current.itemId) === String(rowId)) {
      const cur = activeService?.items?.[m.itemIdx] || {};
      refreshLiveMedleyFlow(rowId, { ...cur, id: rowId, meta: nextMeta || {} });
    }
    try {
      toast.add({
        title: hasArr ? 'Arrangement saved' : 'Arrangement removed',
        description: hasArr ? `${slideN} slides in custom order` : 'Back to the song order',
        type: 'success',
        duration: 4000,
      });
    } catch {}
  };

  // --- KEYBOARD SHORTCUTS ---
  // Medley sessions ride here too: if a medley slide is on air, arrows walk
  // the flattened medley (across songs) instead of the grid's single song.
  // Validation is by identity — if the operator fired something else since
  // (grid click, bible, countdown), the session is over and normal nav resumes.
  const medleyIndexOfCue = (cueId) => {
    const med = medleyRef.current;
    if (!med || !cueId) return -1;
    return med.slides.findIndex(s => (s.cue ? s.cue.id : medleyTitleId(s.songId)) === cueId);
  };
  const handleNextCue = useCallback(() => {
    if (activePresentation) { presentationNextRef.current && presentationNextRef.current(1); return; }
    const med = medleyRef.current;
    if (med && med.slides.length) {
      const at = medleyIndexOfCue(activeCue?.id);
      if (at > -1 && at < med.slides.length - 1) { fireMedleySlideRef.current(med, at + 1); return; }
      if (at > -1) return; // medley end: hold the last slide
      medleyRef.current = null; // jumped elsewhere — session over
    }
    // Arrangement session: title-card steps into the custom order (NOT the
    // library's first slide); walking holds at the end; a foreign slide on
    // air ends the session. Standby/clear fall through to the normal path.
    const arrNext = arrangementForSong(activeSong);
    if (arrNext) {
      const at = arrangementIndexOf(arrNext);
      if (at > -1) {
        if (at < arrNext.length - 1) fireArrangementAt(at + 1);
        return; // arrangement end: hold the last slide
      }
      if (activeCue?.id === 'title-card') { fireArrangementAt(0); return; }
      if (activeCue && activeCue.id !== 'standby' && activeCue.id !== 'clear') arrangeRef.current = null;
    }
    if (!activeSong?.cues) return;
    const currentIndex = activeSong.cues.findIndex(c => c.id === activeCue?.id);
    if (currentIndex === -1 && activeCue?.id !== 'title-card') {
      // Nothing from this song is on air yet — Service Order standby, a cleared
      // output, or a cue left over from the previous song. Start at the title
      // instead of jumping straight to verse 1.
      fireTitleLive();
      return;
    }
    if (currentIndex < activeSong.cues.length - 1) {
      fireCueLive(activeSong.cues[currentIndex + 1]);
    }
  }, [activeSong, activeCue, activePresentation]);

  const handlePrevCue = useCallback(() => {
    if (activePresentation) { presentationNextRef.current && presentationNextRef.current(-1); return; }
    const med = medleyRef.current;
    if (med && med.slides.length) {
      const at = medleyIndexOfCue(activeCue?.id);
      if (at > 0) { fireMedleySlideRef.current(med, at - 1); return; }
      if (at === 0) return; // medley start: hold the first slide
      medleyRef.current = null; // jumped elsewhere — session over
    }
    // Arrangement session: walk backwards through the custom order, hold at
    // the start. Title-card keeps its normal re-fire below.
    const arrPrev = arrangementForSong(activeSong);
    if (arrPrev) {
      const at = arrangementIndexOf(arrPrev);
      if (at > 0) { fireArrangementAt(at - 1); return; }
      if (at === 0) return; // arrangement start: hold the first slide
      if (activeCue && activeCue.id !== 'title-card' && activeCue.id !== 'standby' && activeCue.id !== 'clear') arrangeRef.current = null;
    }
    if (!activeSong?.cues) return;
    const currentIndex = activeSong.cues.findIndex(c => c.id === activeCue?.id);
    if (currentIndex > 0) {
      fireCueLive(activeSong.cues[currentIndex - 1]);
    } else if (currentIndex === 0 || activeCue?.id === 'title-card') {
      fireTitleLive();
    }
  }, [activeSong, activeCue, activePresentation]);

  // Context-aware section jump (unified engine): V = next Verse, C = next
  // Chorus — of the song that's on air RIGHT NOW, never another song's.
  // Inside a medley flow the search stays inside the current song's remaining
  // slides; inside an arrangement it follows the custom order; otherwise the
  // library order. B is deliberately NOT bound: B clears all output, and a
  // destructive key must never gain a second meaning mid-show.
  const jumpToSection = useCallback((kind) => {
    if (activePresentation) return; // sermon owns the keys while visible
    const want = kind === 'V' ? 'verse' : 'chorus';
    const match = (label) => String(label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim().toLowerCase().startsWith(want);
    const noMore = (songTitle) => {
      try {
        toast.add({
          title: `No more ${want === 'verse' ? 'verses' : 'choruses'} from here`,
          description: songTitle || 'End of the flow',
          duration: 2500,
        });
      } catch {}
    };
    const med = medleyRef.current;
    if (med && med.slides.length) {
      const at = medleyIndexOfCue(activeCue?.id);
      const curSong = at > -1 ? med.slides[at].songId : med.slides[0]?.songId;
      const nxt = med.slides.findIndex((s, i) => i > at && String(s.songId) === String(curSong) && s.kind === 'cue' && match(s.cue?.label));
      if (nxt > -1) { fireMedleySlideRef.current(med, nxt); return; }
      const song = lookupMedleySong(med.songs, curSong);
      noMore(song?.title);
      return;
    }
    if (!activeSong?.cues) return;
    const arrList = arrangementForSong(activeSong);
    const list = arrList || activeSong.cues;
    const ci = arrList
      ? arrangementIndexOf(arrList)
      : (activeCue ? list.findIndex(c => c.id === activeCue.id) : -1);
    const nxt = list.findIndex((c, i) => i > ci && match(c.label));
    if (nxt > -1) {
      if (arrList) fireArrangementAt(nxt);
      else fireCueLive(list[nxt]);
      return;
    }
    noMore(activeSong.title);
  }, [activeSong, activeCue, activePresentation]);

  // Derived book list for the 3-column drill-down (filtered by testament + text query)
  const bibleAllBooks = (bibleBooks && bibleBooks.books) || [];
  const bibleOtCount = bibleAllBooks.filter(b => b.testament === 'ot').length;
  const bibleNtCount = bibleAllBooks.filter(b => b.testament === 'nt').length;
  const bibleFilteredBooks = bibleAllBooks.filter(b => {
    const matchesTestament = bibleTestament === 'all' || b.testament === bibleTestament;
    const q = bibleBookQuery.trim().toLowerCase();
    const matchesQuery = !q || b.name.toLowerCase().includes(q) || (b.abbr || '').toLowerCase().includes(q);
    return matchesTestament && matchesQuery;
  });

  // Interactive drill-down step: books → chapters → verses
  const bibleStep = bibleSearchResults ? 'verses' : (bibleChapter ? 'verses' : (bibleSel.bookIndex ? 'chapters' : 'books'));

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tgt = e.target;
      const tag = tgt && tgt.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tgt && tgt.isContentEditable)) return;
      // The Song Editor owns the keyboard while it is open. Lyric editing goes
      // through a real <textarea>, but if focus ever sits on <body>/the canvas
      // instead, these shortcuts preventDefault on Space and steal the arrows
      // (and 'b' clears the live output) — which reads as "I can't type
      // anything". Never hijack keys while the editor modal is open.
      if (isEditorOpen) return;
      // Settings is a modal workspace above the console: keystrokes there
      // (searching translations, naming a template) must not fire live cues.
      if (showSettings) return;
      // Don't handle arrow keys for slide grid when in scripture verse viewer
      // (its own viewer owns Left/Right there) — but Space/B/L still drive
      // the live song, so looking up a verse never freezes the show.
      if (dockTab === 'scripture' && bibleStep === 'verses' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
      if (showModalOpen) {
        if (showBuilder && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); builderAdvance(1); }
        if (showBuilder && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); builderAdvance(-1); }
        return;
      }
      // B = clear the whole output (words AND background → black).
      // L = clear the lyrics only, leaving the background on air running.
      if (e.key === 'b' || e.key === 'B') fireCueLive({ id: 'clear', label: 'Clear', text: '' });
      if (e.key === 'l' || e.key === 'L') { if (clearLyricsRef.current) clearLyricsRef.current(); }
      // M = message overlay toggle: live message clears, otherwise the last
      // message re-fires with its own style/timeout. Never fired blind (no
      // text = no-op) and never from inputs (guarded at the top).
      if (e.key === 'm' || e.key === 'M') {
        if (overlayOnAir(liveOverlay)) clearOverlay();
        else if (lastOverlayRef.current && (lastOverlayRef.current.text || (lastOverlayRef.current.media && lastOverlayRef.current.media.url))) {
          const d = lastOverlayRef.current;
          fireOverlay(d.text, { style: d.style, secs: d.secs, media: d.media || null });
        }
      }
      // V / C = next Verse / Chorus of the song on air (unified section
      // jump). Same input/editor guards as above; never while a builder
      // modal is open (search inputs live there) and never over a visible
      // sermon deck. B stays unbound (blackout) on purpose.
      if ((e.key === 'v' || e.key === 'V' || e.key === 'c' || e.key === 'C') && !medleyModal && !arrangementModal && !(sermon && sermon.loaded && sermon.passthrough)) {
        e.preventDefault(); jumpToSection(e.key.toLowerCase() === 'v' ? 'V' : 'C');
      }
      // Sermon layer owns the arrows: while the slideshow shows beneath, lyrics
      // keys drive its slides (Right/Space next, Left previous) and lyrics
      // stop responding — the wall decides, not the tab in front.
      if (sermon && sermon.loaded && sermon.passthrough) {
        if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); sermonNav(1); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); sermonNav(-1); return; }
      }
      // A focused button or slider owns Space/arrows natively (click the
      // button, move the slider) — firing slide cues on top of that advanced
      // the show every time an operator touched a control then hit Space.
      const onControl = tag === 'BUTTON' || (tgt && tgt.type === 'range');
      if (e.key === ' ') { if (onControl) return; e.preventDefault(); handleNextCue(); }
      if (e.key === 'ArrowRight') { if (onControl) return; e.preventDefault(); handleNextCue(); }
      if (e.key === 'ArrowLeft') { if (onControl) return; e.preventDefault(); handlePrevCue(); }
      if (e.key === '?') { e.preventDefault(); setShowHotkeys(v => !v); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextCue, handlePrevCue, jumpToSection, medleyModal, arrangementModal, showModalOpen, showBuilder, builderSheet, builderTileIdx, dockTab, bibleStep, isEditorOpen, showSettings, sermon, liveOverlay]);

  const toggleTarget = (id) => setTargetedDisplays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  const addNewDisplay = () => {
    const newId = Date.now();
    setDisplays([...displays, { id: newId, name: `Aux Display ${displays.length + 1}`, content: null }]);
    setTargetedDisplays([...targetedDisplays, newId]);
  };

  const persistMediaFile = async (file) => {
    if (!window.require || !file) return null;
    try {
      const { ipcRenderer, webUtils } = window.require('electron');
      const filePath = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile(file) : (file.path || '');
      if (!filePath) return null;
      return await ipcRenderer.invoke('add-media-file', filePath);
    } catch (e) {
      return null;
    }
  };

  // Countdown-private twin: files land in countdown-media/ with NO library
  // registration — the Media tab and song background pickers never see them.
  const persistCountdownFile = async (file) => {
    if (!window.require || !file) return null;
    try {
      const { ipcRenderer, webUtils } = window.require('electron');
      const filePath = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile(file) : (file.path || '');
      if (!filePath) return null;
      return await ipcRenderer.invoke('add-countdown-file', filePath);
    } catch (e) {
      return null;
    }
  };

// --- STAGE DISPLAY FEED ---
  const sendStageData = (currentPayload, nextPayload) => {
    const payload = {
      current: {
        title: currentPayload.title || '',
        label: currentPayload.label || '',
        text: currentPayload.text || '',
        // Is a LYRIC slide on the wall? Media, scripture and sermon slides are
        // not, and the monitor's metronome badge keys off this so a photo's
        // name never sits beside a tempo that belongs to some other song.
        lyric: currentPayload.lyric !== false,
        // A photo/video is on the wall: the monitor names the state instead of
        // echoing the file name (scripture slides keep their own title).
        media: currentPayload.media === true,
        // Countdown on stage: the timer rides on the current payload so the
        // monitor shows the SAME TimerFace as the wall (it used to be
        // silently dropped here, leaving the stage timerless).
        ...(currentPayload.timer ? { timer: currentPayload.timer } : {}),
        timestamp: currentPayload.timestamp || Date.now()
      },
      next: nextPayload ? { title: nextPayload.title, label: nextPayload.label, text: nextPayload.text } : null,
      // Wall mirror: whatever message overlay the audience sees, so the team
      // can confirm it at a glance (read fresh — this runs from effects that
      // may hold a stale render closure).
      wall: (liveOverlayRef.current && liveOverlayRef.current.text) || '',
      timestamp: liveStamp()
    };
    // Keep the exact object that went to the stage window so the phone's
    // singer view renders the same current/next without recomputing it.
    stageSnapshotRef.current = payload;
    // …and mirror it into state so the Stage tab preview stays live.
    if (!isOutputWindow) setStageSnap(payload);
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-stage', payload);
    }
  };

  const isPlainBg = (bg_type, bg_value) => (bg_type == null || bg_type === 'color') && (!bg_value || bg_value.toLowerCase() === '#000000');

  const cueHasBackground = (cue) => cue && !isPlainBg(cue.bg_type, cue.bg_value);

  const songHasBackground = (song) => song && !isPlainBg(song.bg_type, song.bg_value);

  const songBackgroundStyle = (song = activeSong) => {
    if (songHasBackground(song)) {
      return { ...stageStyle, backgroundType: song.bg_type || 'color', backgroundValue: song.bg_value || '#000000' };
    }
    return stageStyle;
  };

  // Every visual field a cue adds on top of the lyric style. One helper so a
  // new payload path cannot forget the cinematic look or the ghost layer.
  const cinematicStyleFields = (cue) => ({
    fx: cue && cue.fx ? cue.fx : null,
    bg_fx: cue && cue.bg_fx ? cue.bg_fx : null,
    ghost: ghostLayerOf(cue),
  });

  const resolutionStyle = (cue, song = activeSong) => {
    // Clear / Stop always lands on black and always DISSOLVES there. A clear
    // cue has no background of its own, so it used to inherit the live song's
    // background (or plain stageStyle) and inherit its transition — stopping
    // could cut straight to black instead of fading. Now it is explicit: black,
    // fading, 600ms to match the background crossfade.
    if (cue && cue.id === 'clear') {
      return { ...stageStyle, backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '600ms' };
    }
    const base = cueHasBackground(cue)
      ? { ...stageStyle, backgroundType: cue.bg_type || 'color', backgroundValue: cue.bg_value || '#000000' }
      : songBackgroundStyle(song);
    if (cue && cue.id !== 'clear') {
      return {
        ...base,
        lyric: cueLyricStyle(cue),
        // Extra text boxes on this slide ride inside the SAME style object, so
        // every live surface (projector, stage, mobile) that already reads
        // `style.lyric` picks them up from one payload change.
        texts: textObjectLayers(cue),
        ...cinematicStyleFields(cue),
        transition: cue.anim || 'none',
        // Per-slide duration override wins over the speed preset.
        speed: cssSpeed(cue.transDuration || cue.speed),
      };
    }
    return base;
  };

  // --- NEW SHOW BUILDER ---
  const defaultShowSections = () => [
    { id: 'sec-' + Date.now(), title: 'Opening', items: [] }
  ];

  const openNewShow = () => {
    const sections = defaultShowSections();
    setShowBuilder({ name: 'Sunday Show', date: new Date().toISOString().split('T')[0], category: 'Worship', ratio: '16:9', resolution: '1920x1080', sections });
    setBuilderSongQuery({});
    setBuilderSheet(null);
    setBuilderTargetSecId(sections[0]?.id || null);
    setBuilderTileIdx(0);
    setBuilderDensity(3);
    setBuilderCollapsed([]);
    setBuilderRehearse(false);
    setBuilderActiveSong(null);
    setBuilderSongDetails({});
    setShowModalOpen(true);
  };

  const closeShowModal = () => setShowModalOpen(false);

  // Prefer the explicit "Add to" target; fall back to the selected sheet section, then the first section.
  const builderTargetSectionId = (() => {
    const sections = showBuilder?.sections || [];
    if (builderTargetSecId && sections.some(s => s.id === builderTargetSecId)) return builderTargetSecId;
    if (builderSheet && sections[builderSheet.secIdx]) return sections[builderSheet.secIdx].id;
    return sections[0]?.id || null;
  })();

  const addSongToSection = (sectionId, song) => {
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: [...s.items, { songId: song.id, title: song.title, artist: song.artist }] } : s)
    }));
  };

  const addSlideToSection = (sectionId) => {
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: [...s.items, { title: 'New Slide', content: '', duration: 60 }] } : s)
    }));
  };

  const updateShowItem = (sectionId, idx, patch) => {
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: s.items.map((it, i) => i === idx ? { ...it, ...patch } : it) } : s)
    }));
  };

  const removeShowItem = (sectionId, idx) => {
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s)
    }));
  };

  const addShowSection = () => {
    const newId = 'sec-' + Date.now() + '-' + ((showBuilder?.sections || []).length + 1);
    setShowBuilder(prev => ({
      ...prev,
      sections: [...(prev.sections || []), { id: newId, title: 'New Section', items: [] }]
    }));
    setBuilderTargetSecId(newId);
  };

  const renameShowSection = (sectionId, title) => {
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, title } : s)
    }));
  };

  const removeShowSection = async (sectionId) => {
    if (!(await appConfirm('Remove this section and all its slides?', { confirmLabel: 'Remove' }))) return;
    setShowBuilder(prev => {
      const sections = prev.sections.filter(s => s.id !== sectionId);
      if (builderTargetSecId === sectionId) setBuilderTargetSecId(sections[0]?.id || null);
      if (builderSheet && prev.sections[builderSheet.secIdx]?.id === sectionId) setBuilderSheet(null);
      return { ...prev, sections };
    });
  };

  const moveShowSection = (sectionId, dir) => {
    setShowBuilder(prev => {
      const idx = prev.sections.findIndex(s => s.id === sectionId);
      const to = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || to < 0 || to >= (prev.sections || []).length) return prev;
      const sections = [...(prev.sections || [])];
      const [moved] = sections.splice(idx, 1);
      sections.splice(to, 0, moved);
      return { ...prev, sections };
    });
  };

  const showTotalSeconds = (showBuilder?.sections || []).reduce((acc, sec) =>
    acc + sec.items.reduce((a, it) => a + (Number(it.duration) || 0), 0), 0);

  const createShow = async () => {
    if (!showBuilder || !showBuilder.name.trim()) { await appAlert('Please name your show.'); return; }
    const items = [];
    showBuilder.sections.forEach(sec => {
      items.push({ item_type: 'section_header', title: sec.title, subtitle: 'Section Flow', content: '', duration: 0 });
      sec.items.forEach(it => {
        if (it.songId) {
          const song = songs.find(s => s.id === it.songId);
          if (song) items.push({ item_type: 'song', title: song.title, subtitle: `${song.artist || 'Worship'} • Song`, content: song.id, duration: 0 });
        } else if (it.media_url) {
          items.push({ item_type: 'media', title: it.title || 'Media', subtitle: sec.title, content: '', media_type: it.media_type || 'image', media_url: it.media_url, duration: Number(it.duration) || 0 });
        } else {
          items.push({ item_type: 'custom_slide', title: it.title || 'Slide', subtitle: sec.title, content: it.content || '', style: it.style, duration: Number(it.duration) || 0 });
        }
      });
    });
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const savedId = await ipcRenderer.invoke('db-save-service', { id: null, name: showBuilder.name, date: showBuilder.date, category: showBuilder.category || 'Worship', ratio: showBuilder.ratio || '16:9', resolution: showBuilder.resolution || '1920x1080', items });
      const details = await ipcRenderer.invoke('db-get-service-details', savedId);
      if (details) setActiveService(details);
      fetchServices();
      setShowModalOpen(false);
      setActiveTab('service');
    }
  };

  // Latest click wins here too (same class as selectSong): a fast A-then-B
  // must not land A's song in B's slot.
  const builderLoadSeqRef = useRef(0);
  const selectBuilderItem = async (secIdx, itemIdx) => {
    setBuilderSheet({ secIdx, itemIdx });
    setBuilderTileIdx(0);
    const item = showBuilder?.sections?.[secIdx]?.items?.[itemIdx];
    if (item?.songId && window.require) {
      const { ipcRenderer } = window.require('electron');
      const seq = ++builderLoadSeqRef.current;
      const details = repairSongBoxes(await ipcRenderer.invoke('db-get-song-details', item.songId));
      if (seq !== builderLoadSeqRef.current) return;
      setBuilderActiveSong(details);
      if (details) setBuilderSongDetails(prev => ({ ...prev, [item.songId]: details }));
    } else {
      setBuilderActiveSong(null);
    }
  };

  // Prefetch keyed on the song SET, not the builder object: every keystroke or
  // rename creates a new showBuilder identity, and keying the effect on it
  // refetched every song on every keystroke (with older, larger batches able
  // to land last and merge stale details). Guarded + id-keyed instead.
  const builderSongIds = [...new Set((showBuilder?.sections || []).flatMap(s => s.items.filter(i => i.songId).map(i => i.songId)))];
  const builderSongIdsKey = builderSongIds.map(String).sort().join(',');
  useEffect(() => {
    if (!showModalOpen || !window.require) return;
    const songIds = builderSongIdsKey ? [...new Set(builderSongIdsKey.split(','))].map(s => {
      const orig = builderSongIds.find(o => String(o) === s);
      return orig !== undefined ? orig : s;
    }) : [];
    if (songIds.length === 0) return;
    let alive = true;
    (async () => {
      const { ipcRenderer } = window.require('electron');
      const detailsArr = await Promise.all(songIds.map(id => ipcRenderer.invoke('db-get-song-details', id)));
      if (!alive) return;
      const map = {};
      detailsArr.forEach((d, i) => { if (d) map[songIds[i]] = repairSongBoxes(d); });
      setBuilderSongDetails(prev => ({ ...prev, ...map }));
    })();
    return () => { alive = false; };
  }, [showModalOpen, builderSongIdsKey]);

  const builderItemSlideCount = (item) => {
    if (!item) return 0;
    if (item.songId) {
      const s = builderSongDetails[item.songId] || songs.find(x => x.id === item.songId);
      return s ? (s.cues || []).length + 1 : 1;
    }
    return 1;
  };

  const builderFlatItems = (() => {
    const out = [];
    let running = 0;
    (showBuilder?.sections || []).forEach((sec, si) => {
      sec.items.forEach((item, ii) => {
        const count = builderItemSlideCount(item);
        out.push({ si, ii, sec, item, globalStart: running, count });
        running += count;
      });
    });
    return out;
  })();

  const builderTotalSlides = builderFlatItems.reduce((a, x) => a + x.count, 0);

  const builderCurrentEntry = builderFlatItems.find(e => e.si === builderSheet?.secIdx && e.ii === builderSheet?.itemIdx);

  const builderGoLive = (entry, tileIdx) => {
    if (!entry) return;
    liveBibleRef.current = null;
    liveBibleSrcRef.current = null;
    setBuilderTileIdx(tileIdx);
    const item = entry.item;

    if (builderRehearse) {
      return;
    }

    if (item.songId) {
      const song = builderSongDetails[item.songId] || builderActiveSong || songs.find(s => s.id === item.songId);
      if (!song) return;
      if (tileIdx === 0) {
        setActiveSong(song);
        const titleCue = song.title_cue || { id: 'title-card', label: 'Song Title', text: song.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: DEFAULT_LYRIC_SIZE, align: 'center', color: '#ffffff' };
        setActiveCue(titleCue);
        setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
        // Build bg from THIS song (activeSong state has not flushed yet).
        const titleBg = cueHasBackground(titleCue)
          ? { backgroundType: titleCue.bg_type || 'color', backgroundValue: titleCue.bg_value || '#000000' }
          : songHasBackground(song)
            ? { backgroundType: song.bg_type || 'color', backgroundValue: song.bg_value || '#000000' }
            : { backgroundType: stageStyle.backgroundType, backgroundValue: stageStyle.backgroundValue };
        const slidePayload = {
          title: song.artist || '',
          artist: song.artist || '',
          text: titleCue.text || song.title,
          label: 'Song Title',
          style: { ...stageStyle, ...titleBg, lyric: cueLyricStyle(titleCue), ...cinematicStyleFields(titleCue), transition: titleCue.anim || 'fade', speed: cssSpeed(titleCue.transDuration || titleCue.speed) },
          audio: song.audio_url || null,
          timestamp: liveStamp()
        };
        setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
        if (window.require && targetedDisplays.includes(1)) { window.require('electron').ipcRenderer.send('update-live-slide', slidePayload); }
        const nextCue = (song.cues || [])[0];
        sendStageData({ title: slidePayload.title, label: 'Song Title', text: song.title, timestamp: slidePayload.timestamp }, nextCue ? { title: song.title, label: nextCue.label, text: nextCue.text } : null);
      } else {
        const cue = (song.cues || [])[tileIdx - 1];
        if (!cue) return;
        setActiveSong(song);
        setActiveCue(cue);
        const d = Number(cue.duration) || 0;
        setSlideTimer({ start: Date.now(), elapsed: 0, duration: d });
        const effectiveStyle = (() => {
          const base = cueHasBackground(cue)
            ? { ...stageStyle, backgroundType: cue.bg_type || 'color', backgroundValue: cue.bg_value || '#000000' }
            : songHasBackground(song)
              ? { ...stageStyle, backgroundType: song.bg_type || 'color', backgroundValue: song.bg_value || '#000000' }
              : { ...stageStyle };
          return { ...base, lyric: cueLyricStyle(cue), texts: textObjectLayers(cue), ...cinematicStyleFields(cue), transition: cue.anim || 'none', speed: cssSpeed(cue.transDuration || cue.speed) };
        })();
        const slidePayload = { title: song.title, artist: song.artist || '', text: cue.text, label: cue.label || '', style: effectiveStyle, audio: song.audio_url || null, timestamp: liveStamp() };
        setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
        if (window.require && targetedDisplays.includes(1)) { window.require('electron').ipcRenderer.send('update-live-slide', slidePayload); }
        const cueList = song.cues || [];
        const idx = cueList.findIndex(c => c.id === cue.id);
        const nextCue = idx > -1 ? cueList[idx + 1] : cueList[0];
        sendStageData({ title: song.title, label: cue.label || '', text: cue.text, timestamp: slidePayload.timestamp }, nextCue ? { title: song.title, label: nextCue.label, text: nextCue.text } : null);
      }
    } else if (item.media_url) {
      fireServiceItemLive({ id: 'b-' + Date.now(), item_type: 'media', title: item.title, subtitle: entry.sec.title, content: '', media_type: item.media_type, media_url: item.media_url, duration: item.duration || 0 });
    } else {
      fireServiceItemLive({ id: 'b-' + Date.now(), item_type: 'custom_slide', title: item.title, subtitle: entry.sec.title, content: item.content || '', style: item.style, duration: item.duration || 0 });
    }
  };

  const builderAdvance = (dir) => {
    if (!builderCurrentEntry) return;
    const nextIdx = builderTileIdx + dir;
    const count = builderCurrentEntry.count;
    if (nextIdx >= 0 && nextIdx < count) {
      builderGoLive(builderCurrentEntry, nextIdx);
    } else if (nextIdx >= count) {
      const curPos = builderFlatItems.indexOf(builderCurrentEntry);
      if (curPos < builderFlatItems.length - 1) {
        const next = builderFlatItems[curPos + 1];
        selectBuilderItem(next.si, next.ii);
        setTimeout(() => builderGoLive(next, 0), 50);
      }
    } else if (nextIdx < 0) {
      const curPos = builderFlatItems.indexOf(builderCurrentEntry);
      if (curPos > 0) {
        const prev = builderFlatItems[curPos - 1];
        const prevCount = prev.count;
        selectBuilderItem(prev.si, prev.ii);
        setTimeout(() => builderGoLive(prev, prevCount - 1), 50);
      }
    }
  };

  const builderUpNext = (() => {
    if (!builderCurrentEntry) return null;
    const pos = builderFlatItems.indexOf(builderCurrentEntry);
    if (builderTileIdx + 1 < builderCurrentEntry.count) {
      return { entry: builderCurrentEntry, tileIdx: builderTileIdx + 1 };
    }
    if (pos < builderFlatItems.length - 1) {
      return { entry: builderFlatItems[pos + 1], tileIdx: 0 };
    }
    return null;
  })();

  // Drop a media item into the section the builder is targeting. Falls back to
  // the first section, which is what the "Add to" picker in the modal shows
  // when nothing has been chosen yet — so an upload right after opening the
  // builder no longer fails with "Add a section first".
  const pushBuilderMedia = async (item) => {
    const secId = builderTargetSectionId || (showBuilder.sections || [])[0]?.id;
    if (!secId) { await appAlert('Add a section first, then try again.'); return; }
    setShowBuilder(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === secId ? { ...s, items: [...s.items, item] } : s)
    }));
  };

  const addShowBuilderMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (!url) { await appAlert('Could not copy that media file. Try another image or video.'); if (e.target) e.target.value = ''; return; }
    await pushBuilderMedia({ title: file.name.replace(/\.[^.]+$/, ''), content: '', duration: 0, media_type: file.type.startsWith('video/') ? 'video' : 'image', media_url: url });
    if (e.target) e.target.value = '';
  };

  // Same item, but picked from media already inside the app — nothing is
  // re-uploaded and no copy of the file is made.
  const addShowBuilderExistingMedia = (asset) => {
    if (!asset?.url) return;
    let name = asset.name || '';
    if (!name) {
      try { name = decodeURIComponent(String(asset.url).split('/').pop().split('?')[0]); } catch (_) { name = 'Media'; }
    }
    pushBuilderMedia({ title: name.replace(/\.[^.]+$/, ''), content: '', duration: 0, media_type: asset.kind === 'video' ? 'video' : 'image', media_url: asset.url });
  };

  const addShowBuilderPlaceholder = (label) => {
    const secId = builderTargetSectionId;
    if (secId) {
      setShowBuilder(prev => ({
        ...prev,
        sections: prev.sections.map(s => s.id === secId ? { ...s, items: [...s.items, { title: label, content: '', duration: 60 }] } : s)
      }));
    }
  };

  // NOTE: the live-timer clock no longer ticks App state. A 500ms interval
  // here used to re-render this entire component while any slide was live.
  // The clock now ticks inside the tiny display components (LiveBadge /
  // TimerReadout in src/lib/perf.jsx) so only a <span> updates per tick.

  const fireCueLive = (cue, songOverride, arrIndex) => {
    // songOverride lets medley slides fire with their OWN song's title, art,
    // audio and background instead of whatever the grid has selected.
    const song = songOverride || activeSong;
    // Keep the arrangement session's exact step. A direct fire (no index)
    // deliberately drops it back to id matching.
    if (arrangeRef.current && sameSongId(arrangeRef.current.songId, song?.id)) {
      arrangeRef.current = {
        ...arrangeRef.current,
        index: Number.isInteger(arrIndex) ? arrIndex : null,
        cueId: cue?.id ?? null,
      };
    }
    liveBibleRef.current = null;
    liveBibleSrcRef.current = null;
    setActiveCue(cue);
    if (cue?.id === 'clear') {
      setSlideTimer({ start: null, elapsed: 0, duration: 0 });
      // Clear All takes the message overlay with it (blackout means black).
      // Clear Lyrics (clearLyrics above) deliberately does not — the overlay
      // outlives slide changes by design.
      clearOverlay();
      // Remote drawings die on blackout too — a highlight must never float
      // over whatever fires next.
      setDrawStrokesLive([]);
    } else {
      const d = Number(cue?.duration) || 0;
      setSlideTimer({ start: Date.now(), elapsed: 0, duration: d });
    }
    const effectiveStyle = resolutionStyle(cue, song);
    const slidePayload = { 
      title: song?.title || '', 
      artist: song?.artist || '',
      text: cue && cue.id !== 'clear' ? cue.text : '',
      label: cue?.label || '',
      style: effectiveStyle,
      audio: song?.audio_url || null,
      timestamp: liveStamp() 
    };
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    // Stage feed: current + next cue. Inside an arrangement session the
    // "next" slide is the next in the CUSTOM order, not the library order
    // (and the output preload below follows it too). Medley sessions win
    // outright — the two flows never mix.
    const medLive = medleyRef.current && medleyRef.current.slides.length;
    const arrLive = !medLive ? arrangementForSong(song) : null;
    const cueList = arrLive || song?.cues || [];
    // Repeated sections share one cue id: use the exact arrangement step when
    // this fire came from one, otherwise fall back to id matching.
    const arrAt = arrLive && Number.isInteger(arrIndex) && arrLive[arrIndex]?.id === cue?.id ? arrIndex : -1;
    const idx = arrAt > -1 ? arrAt : (cue?.id ? cueList.findIndex(c => c.id === cue.id) : -1);
    const nextCue = idx > -1 ? cueList[idx + 1] : (cueList.length > 0 ? cueList[0] : null);
    sendStageData(
      { title: slidePayload.title, label: cue?.label || 'Song Title', text: cue?.id === 'clear' ? '' : slidePayload.text, timestamp: slidePayload.timestamp },
      nextCue ? { title: song?.title, label: nextCue.label, text: nextCue.text } : null
    );
    // Warm the OUTPUT's cache for the next cue's background while this slide
    // is on screen, so a song switch mounts warm instead of decoding cold
    // mid-transition. Command-style (type + url only) — bytes never travel
    // through IPC, and a same-as-current bg is a no-op cache hit.
    try {
      if (window.require && targetedDisplays.includes(1) && nextCue) {
        const { ipcRenderer } = window.require('electron');
        const nbg = cueHasBackground(nextCue)
          ? { type: nextCue.bg_type, url: nextCue.bg_value }
          : (songHasBackground(activeSong) ? { type: activeSong.bg_type, url: activeSong.bg_value } : null);
        // File media only: gradients/animated are pure CSS (nothing to warm,
        // and a css string must never travel as a preload URL).
        if (nbg && (nbg.type === 'image' || nbg.type === 'video') && nbg.url) ipcRenderer.send('output-preload', nbg);
      }
    } catch {}
    // First lyric slide takes the room: the BGM playlist fades out over the
    // configured seconds. Backing-track audio rides the slide payload itself.
    if (cue?.id !== 'clear' && idx === 0) {
      try { audioEngine.autoTake(); } catch {}
    }
  };

  // --- COUNTDOWN TIMER (bottom-dock tab) ---
  // Clock math is absolute: one endsAt timestamp travels with the payload and
  // every surface (tab preview, monitor, projector, stage) derives the same
  // remaining time from Date.now() on its own 500ms tick. No per-second IPC,
  // no drift between screens. Wall-clock mode needs no end at all.
  const fireCountdownLive = () => {
    const cfg = { ...DEFAULT_COUNTDOWN, ...(countdown || {}) };
    const now = Date.now();
    let endsAt = null;
    if (cfg.mode === 'duration') {
      endsAt = now + Math.max(1, Number(cfg.durationSec) || 0) * 1000;
    } else if (cfg.mode === 'target' && cfg.targetTime) {
      // Rollover included: a past time today means tomorrow's service.
      endsAt = nextTargetTime(cfg.targetTime, now);
    }
    // The live snapshot owns routing + timing: Stop and live config edits
    // read showOn/endsAt from HERE, never from the (possibly since changed)
    // form, so a mid-air picker change can't strand a surface.
    setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), ...cfg, live: { endsAt, startedAt: now, showOn: cfg.showOn, stamp: now, pausedAt: null, pausedRemain: null } }));
    // Go Live takes the room: BGM fades out over the configured seconds.
    try { audioEngine.autoTake(); } catch {}
  };

  // VIDEO-COUNTDOWN TRANSPORT: Pause captures the remaining ms once and
  // freezes the absolute clock (every surface derives the same stopped
  // number); Resume re-anchors endsAt from it — phases resume exactly where
  // they froze, never skipping the splash or the final-five return. Only the
  // video countdown UI exposes these, so normal/slideshow timing is untouched.
  const pauseCountdownLive = () => {
    const snap = countdown?.live;
    if (!snap || snap.pausedAt != null || snap.endsAt == null) return;
    const now = Date.now();
    setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), live: { ...snap, pausedAt: now, pausedRemain: Math.max(0, snap.endsAt - now) } }));
  };
  const resumeCountdownLive = () => {
    const snap = countdown?.live;
    if (!snap || snap.pausedAt == null) return;
    const now = Date.now();
    setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), live: { ...snap, endsAt: now + Math.max(0, Number(snap.pausedRemain) || 0), pausedAt: null, pausedRemain: null } }));
  };

  // The ONE sender for live countdown payloads. fire only stamps state; this
  // effect pushes — so title/bg/size edits made while LIVE go out on the next
  // render with the SAME endsAt (the clock never resets under an edit).
  // Signature-deduped: stamping live must not double-send what fire covered.
  const countdownSentRef = useRef(null);
  useEffect(() => {
    if (!countdown?.live || isOutputWindow || !window.require) return;
    const cfg = { ...DEFAULT_COUNTDOWN, ...countdown };
    const timer = { ...cfg };
    const sig = JSON.stringify([timer.title, timer.subtext, timer.mode, timer.durationSec, timer.targetTime, timer.showOn, timer.overtime, timer.titleSize, timer.timeSize, timer.subtextSize, timer.bgType, timer.bgValue, timer.bgMedia, timer.live.endsAt, timer.live.stamp, timer.live.pausedAt ?? null, timer.live.pausedRemain ?? null]);
    if (countdownSentRef.current === sig) return;
    countdownSentRef.current = sig;
    try { console.info('[countdown] push', countdownProof(timer)); } catch {}
    const { ipcRenderer } = window.require('electron');
    const stamp = timer.live.stamp || Date.now();
    if (timer.showOn === 'both' || timer.showOn === 'main') {
      const slidePayload = {
        title: timer.title || '',
        artist: '',
        text: '',
        label: 'Countdown Timer',
        timer,
        audio: null,
        timestamp: stamp,
        style: { backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '600ms' },
      };
      setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
      if (targetedDisplays.includes(1)) ipcRenderer.send('update-live-slide', slidePayload);
    }
    if (timer.showOn === 'both' || timer.showOn === 'stage') {
      sendStageData({ title: timer.title || 'Countdown', label: 'Countdown Timer', text: '', timer, lyric: false, timestamp: stamp }, null);
    }
  }, [countdown]);

  const stopCountdownLive = () => {
    const snap = countdown?.live;
    // Nothing on air: stopping must be a no-op, never a surprise blackout
    // (the reset button sits next to Go Live even when idle).
    if (!snap) return;
    const showOn = snap.showOn || countdown?.showOn;
    countdownSentRef.current = null;
    // Countdown leaving the air hands the room to the service: the whole
    // pre-service soundbed (BGM + pads) fades out. Idle reset hits the
    // no-op guard above and never touches audio.
    try { audioEngine.countdownFinished(); } catch {}
    setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), live: null }));
    // Stop returns the room to black: main output blackouts, stage clears.
    if (!showOn || showOn === 'both' || showOn === 'main') {
      fireCueLive({ id: 'clear', label: 'Clear', text: '' });
    }
    if (!showOn || showOn === 'both' || showOn === 'stage') {
      sendStageData({ title: '', label: '', text: '', lyric: false, timestamp: liveStamp() }, null);
    }
  };

  // Booth video → projector. The VideoPanel is the transport master (picture
  // + sound in the booth); the wall plays the same file MUTED — one machine
  // must never double its own audio. Every transport action re-pushes with
  // the booth's position so the wall re-syncs; playlist end / tab leave /
  // explicit stop pushes stop → black. activeCue is untouched (Clear-Lyrics
  // trick), so service rows keep their state.
  //
  // Stamp discipline (no wall flash): user-initiated plays arrive with a
  // FRESH stamp (clean remount at the new position); pause/seek/loop and the
  // periodic drift-guard pushes reuse the air stamp, so consumers re-render
  // in place and only re-seek when actually off.
  const fireVideoLive = (video) => {
    const stamp = (video && video.stamp) || Date.now();
    const onAir = !!(video && video.url && video.action !== 'stop');
    const slidePayload = {
      title: onAir ? (video.name || '') : '',
      artist: '',
      text: '',
      label: onAir ? 'Video' : 'Clear',
      video: onAir
        ? { url: video.url, name: video.name || '', action: video.action || 'play', position: Math.max(0, Number(video.position) || 0), loop: !!video.loop, stamp }
        : null,
      audio: null,
      timestamp: stamp,
      style: { backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '600ms' },
    };
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
    if (window.require && targetedDisplays.includes(1)) {
      window.require('electron').ipcRenderer.send('update-live-slide', slidePayload);
    }
    // Stage feed: a video on the wall is not a song, so the monitor names the
    // state and keeps the tempo badge off. Stopping (onAir false) clears it.
    sendStageData(
      onAir
        ? { title: video.name || '', label: 'Video', text: '', lyric: false, media: true, timestamp: stamp }
        : { title: '', label: 'Clear', text: '', lyric: false, timestamp: stamp },
      null
    );
  };

  // Clear All blacks the whole output. Clear Lyrics is the softer one: only the
  // words leave, the background behind them keeps running.
  //   * the payload reuses the backgroundType/backgroundValue that are on air,
  //     so ProjectorDisplay's `bgKey` does not change — the background layer
  //     never remounts and a looping video keeps looping;
  //   * `activeCue` is deliberately left alone. It is what "which service item
  //     is live" is derived from, and nothing on screen changed except the
  //     text — so the row stays lit and Stop still works, and advancing
  //     afterwards continues from the slide that was showing.
  // What the lyrics output is showing right now. The operator window never
  // listens for `render-live-slide`, so its `currentSlide` stays at the initial
  // placeholder — the payload pushed onto `displays` is the live one there,
  // while in a projector window `currentSlide` is the authoritative copy.
  const liveOutputPayload = () => {
    if (currentSlide && currentSlide.style && currentSlide.style.backgroundType) return currentSlide;
    const proj = (displays || []).find(d => d.id === 1);
    if (proj && proj.content) return proj.content;
    return currentSlide || null;
  };

  const liveOutputStyle = () => {
    const live = liveOutputPayload();
    return (live && live.style && live.style.backgroundType) ? live.style : songBackgroundStyle();
  };

  const clearLyrics = () => {
    const live = liveOutputPayload();
    const cueList = arrangementForSong(activeSong) || activeSong?.cues || [];
    const a = arrangeRef.current;
    const at = a && Number.isInteger(a.index) && cueList[a.index]?.id === a.cueId
      ? a.index
      : (activeCue?.id ? cueList.findIndex(c => c.id === activeCue.id) : -1);
    const nextCue = at > -1 ? cueList[at + 1] : (cueList.length > 0 ? cueList[0] : null);
    const slidePayload = {
      title: activeSong?.title || live?.title || '',
      artist: activeSong?.artist || '',
      text: '',
      label: '',
      style: { ...liveOutputStyle(), transition: 'fade', speed: '600ms' },
      // A running sermon deck is not lyrics — Clear Lyrics must not take it down.
      presentation: live?.presentation || null,
      meta: live?.meta || null,
      audio: activeSong?.audio_url || null,
      timestamp: liveStamp()
    };
    setSlideTimer({ start: null, elapsed: 0, duration: 0 });
    setDisplays(prev => prev.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    sendStageData(
      { title: slidePayload.title, label: '', text: '', lyric: false, timestamp: slidePayload.timestamp },
      nextCue ? { title: activeSong?.title, label: nextCue.label, text: nextCue.text } : null
    );
  };
  clearLyricsRef.current = clearLyrics;

  // --- MESSAGE OVERLAY (ProPresenter-Messages style) -------------------------
  // Text pinned ABOVE the live slide with its own lifecycle: showing, timing
  // out or clearing it never touches activeCue, the slide payload, the
  // background video or the stage feed — it travels on its own IPC channel
  // and dies only here, by timeout, or with Clear All. `until: 0` = pinned.
  // (liveOverlay state + lastOverlayRef are declared with the top UI state —
  // the global keydown effect reads liveOverlay in its deps.)
  const fireOverlay = (text, opts = {}) => {
    const clean = String(text || '').trim();
    const mediaUrl = opts.media && typeof opts.media.url === 'string' ? opts.media.url.trim() : '';
    const mediaPos = ['tl', 'tr', 'bl', 'br'].includes(opts.media && opts.media.pos) ? opts.media.pos : 'br';
    if ((!clean && !mediaUrl) || isOutputWindow || !window.require) return;
    const style = opts.style === 'center' || opts.style === 'banner' ? opts.style : 'lower';
    const secs = Math.max(0, Math.floor(Number(opts.secs) || 0));
    const now = Date.now();
    const ov = { text: clean, style, until: secs > 0 ? now + secs * 1000 : 0, stamp: now };
    if (mediaUrl) ov.media = { url: mediaUrl.slice(0, 500), pos: mediaPos };
    lastOverlayRef.current = { text: clean, style, secs, media: ov.media || null };
    setLiveOverlay(ov);
    try { window.require('electron').ipcRenderer.send('update-live-overlay', ov); } catch {}
  };
  const clearOverlay = () => {
    if (isOutputWindow) return;
    setLiveOverlay(null);
    if (!window.require) return;
    try { window.require('electron').ipcRenderer.send('update-live-overlay', null); } catch {}
  };
  // Timeout owns exactly one interval, only while a timed message is live —
  // same discipline as every other tick in this file. Pinned (until 0) and
  // output windows (dumb mirrors) never arm it.
  useEffect(() => {
    if (isOutputWindow || !liveOverlay || !liveOverlay.until) return undefined;
    const id = setInterval(() => {
      if (Date.now() >= liveOverlay.until) clearOverlay();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOutputWindow, liveOverlay && liveOverlay.stamp]);

  // Stage wall-mirror: an overlay firing or clearing mid-song must reach the
  // team without waiting for the next cue. Re-send the last stage snapshot
  // with the fresh wall text (snapshot holds current/next, so nothing else
  // moves). Console-only; stage windows and phones just render it.
  useEffect(() => {
    if (isOutputWindow || !window.require) return undefined;
    const snap = stageSnapshotRef.current;
    if (!snap || !snap.current) return undefined;
    const wall = (liveOverlay && liveOverlay.text) || '';
    if ((snap.wall || '') === wall) return undefined;
    const payload = { ...snap, wall, timestamp: liveStamp() };
    stageSnapshotRef.current = payload;
    setStageSnap(payload);
    try { window.require('electron').ipcRenderer.send('update-live-stage', payload); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOutputWindow, liveOverlay && liveOverlay.stamp, liveOverlay && liveOverlay.text]);

  const previewAnimation = useCallback((animKey, cueOverride) => {
    const cue = (cueOverride && cueOverride.id && cueOverride.id !== 'clear')
      ? cueOverride
      : (activeCue && activeCue.id && activeCue.id !== 'clear' ? activeCue : null);
    if (!cue) return;
    const effectiveStyle = resolutionStyle(cue);
    const previewStyle = animKey ? { ...effectiveStyle, transition: animKey } : effectiveStyle;
    const slidePayload = {
      title: activeSong?.title || '',
      artist: activeSong?.artist || '',
      text: cue.text || '',
      label: cue.label || '',
      style: previewStyle,
      audio: activeSong?.audio_url || null,
      timestamp: liveStamp(),
    };
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
  }, [activeCue, activeSong, targetedDisplays, displays, resolutionStyle]);

  const fireTitleLive = (songOverride, cueOverride) => {
    const song = songOverride || activeSong;
    if (!song) return;
    liveBibleRef.current = null;
    liveBibleSrcRef.current = null;
    // cueOverride lets medley titles carry their synthetic tracking id
    // (medley-title-<songId>) instead of the shared 'title-card'.
    const titleCue = cueOverride || song.title_cue || { id: 'title-card', label: 'Song Title', text: song.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: DEFAULT_LYRIC_SIZE, align: 'center', color: '#ffffff' };
    if (arrangeRef.current && sameSongId(arrangeRef.current.songId, song?.id)) {
      arrangeRef.current = { ...arrangeRef.current, index: null, cueId: null };
    }
    setActiveCue(titleCue);
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    const effectiveStyle = resolutionStyle(titleCue, song);
    const slidePayload = { 
      // Title slide, so the title IS the song (the artist rides `artist`).
      // This payload's title feeds the stage feed + phone snapshots — it used
      // to carry song.artist, so every singer screen read "Unknown" (the
      // import default) instead of the song name.
      title: song.title || '',
      artist: song.artist || '',
      text: titleCue.text || song.title,
      label: 'Song Title',
      // resolutionStyle keeps the global cue default at 'none' so ordinary
      // lyrics stay a crisp cut. Titles are a different moment — coming out of
      // Service Order standby they must dissolve in, not pop. Same rule the
      // Show Builder already uses (builderGoLive).
      style: { ...effectiveStyle, transition: titleCue.anim || 'fade' },
      audio: song.audio_url || null,
      timestamp: liveStamp() 
    };
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    const medLiveTitle = medleyRef.current && medleyRef.current.slides.length;
    const titleFlow = (!medLiveTitle && arrangementForSong(song)) || song.cues || [];
    const nextCue = titleFlow.length > 0 ? titleFlow[0] : null;
    sendStageData(
      { title: slidePayload.title, label: 'Song Title', text: song.title, timestamp: slidePayload.timestamp },
      nextCue ? { title: song.title, label: nextCue.label, text: nextCue.text } : null
    );
    // Title slide is the song's first moment — same BGM take as lyric one.
    try { audioEngine.autoTake(); } catch {}
  };

  // --- PRESENTATION (SERMON DECK) LIVE CONTROLS ---
  const firePresentationSlide = (deck, index, sourceId) => {
    const slides = (deck && deck.slides) || [];
    const s = slides[index];
    if (!s) return;
    setActivePresentation({ deck, index });
    const slidePayload = {
      title: deck.title,
      text: '',
      label: `Slide ${index + 1} of ${slides.length}`,
      style: { ...stageStyle, backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '400ms' },
      audio: null,
      meta: { kind: 'presentation' },
      presentation: { deckTitle: deck.title, slide: s, index, total: slides.length },
      timestamp: liveStamp()
    };
    setActiveCue({ id: sourceId || ('pres-' + (deck.id || 'unsaved')), label: deck.title, text: '' });
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    sendStageData({ title: deck.title, label: slidePayload.label, text: s.notes || '', lyric: false, timestamp: slidePayload.timestamp }, null);
  };

  const presentDeck = (deck) => {
    // Presenting a deck belongs in the Slideshow workspace: that is where the
    // slide grid, live transport and editing controls now live.
    setDockTab('sermon');
    firePresentationSlide(deck, 0);
  };

  const stopPresentation = () => setActivePresentation(null);

  const firePresentationFromItem = (item) => {
    let deck = null;
    try { deck = JSON.parse(item.content); } catch (_) { deck = null; }
    if (deck && Array.isArray(deck.slides) && deck.slides.length) firePresentationSlide(deck, 0, item.id);
  };

  presentationNextRef.current = (dir) => {
    const cur = activePresentation;
    if (!cur || !cur.deck) return;
    const total = (cur.deck.slides || []).length;
    const next = Math.max(0, Math.min(total - 1, cur.index + dir));
    if (next !== cur.index) firePresentationSlide(cur.deck, next);
  };

  // --- SERVICE ORDER: GO ON A SONG → BACKGROUND-FIRST STANDBY ---
  // Go on a song while something is already on air must not hard-cut straight
  // to the new song's title. Stage the new song's BACKGROUND only — no title,
  // no lyrics — so the operator's next move (the title slide) is what reveals
  // the song. The payload carries a fade so the output dissolves into standby
  // instead of cutting; the background layer crossfades on its own key.
  const stageSongBackground = async (id) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const cueOnAir = activeCue; // frozen at click time; the await below can outlive this render
    const seq = ++songLoadSeqRef.current;
    const details = repairSongBoxes(await ipcRenderer.invoke('db-get-song-details', id));
    if (!details || seq !== songLoadSeqRef.current) return; // a newer click won
    setActiveSong(details);
    // Browsing rows re-points activeSong without touching the output, so the
    // cue on air can belong to this song even though activeSong pointed
    // elsewhere. If this song's own slide is already showing there is nothing
    // to stage — just select it.
    if ((details.cues || []).some(c => c.id === cueOnAir?.id)) return;
    // The output is being taken over by this song — if a sermon deck thought
    // it was live, releasing it keeps keyboard advancing in sync with what's
    // actually on screen.
    setActivePresentation(null);
    // Synthetic cue: makes the "is the output live" guards treat standby as
    // on-air, while highlighting no slide-grid tile (isLive only matches cue
    // ids / 'title-card').
    setActiveCue({ id: 'standby', label: 'Standby', text: '' });
    setSlideTimer({ start: null, elapsed: 0, duration: 0 });
    const bg = songHasBackground(details)
      ? { backgroundType: details.bg_type || 'color', backgroundValue: details.bg_value || '#000000' }
      : { backgroundType: stageStyle.backgroundType, backgroundValue: stageStyle.backgroundValue };
    const slidePayload = {
      title: details.title || '',
      artist: details.artist || '',
      text: '',
      label: '',
      style: { ...stageStyle, ...bg, transition: 'fade', speed: '600ms' },
      audio: null, // stops the outgoing song's looping pad on the switch
      standby: true,
      timestamp: liveStamp()
    };
    // Functional update: the await above can outlive this render's copy of
    // `displays`, and a stale array here would drop a concurrent push.
    setDisplays(prev => prev.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (targetedDisplays.includes(1)) ipcRenderer.send('update-live-slide', slidePayload);
    // Stage feed: singers get the upcoming song as "current", not "Blackout".
    const firstCue = (details.cues || [])[0] || null;
    sendStageData(
      { title: details.title || '', label: 'Song Title', text: details.title || '', timestamp: slidePayload.timestamp },
      firstCue ? { title: details.title, label: firstCue.label, text: firstCue.text } : null
    );
  };

  // Service rows are recognised by id (that is what `activeCue.id` is compared
  // against). Rows created before a plan is saved carry none — and
  // `undefined === undefined` would light up every id-less row at once.
  const genServiceItemId = () => `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Medley Builder modal state lives near the top (see arrangementModal):
  // the keyboard effect reads it before this section runs.
  // The modal edits links; saving converts the row (or back to plain song).

  const openMedleyForRow = async (item, idx) => {
    if (!item) return;
    // Resolve against the FULL library, never the filtered `songs` view: a
    // search/category filter in the Songs tab used to hide songs from title
    // lookup (fallback "Song") and from the modal's own search.
    let lib = songs || [];
    if (window.require) {
      try {
        const full = await window.require('electron').ipcRenderer.invoke('db-get-songs', '', 'All');
        if (Array.isArray(full) && full.length) lib = full;
      } catch {}
    }
    const titleOf = (songId, fallback = 'Song') => {
      const s = lib.find(x => sameSongId(x.id, songId));
      return s?.title || fallback;
    };
    if (item.item_type === 'medley') {
      const def = parseMedleyDef(item);
      if (!def) return;
      setMedleyModal({
        anchor: { songId: def.anchor.songId, title: titleOf(def.anchor.songId, item.title), parts: def.anchor.includedParts },
        itemIdx: idx,
        existing: def.links.map(l => ({ songId: l.songId, title: titleOf(l.songId), parts: l.includedParts, skip: l.skipTitleSlide })),
        anchorArranged: !!(item.meta?.arrangement && ((Array.isArray(item.meta.arrangement.flow) && item.meta.arrangement.flow.length) || (Array.isArray(item.meta.arrangement.order) && item.meta.arrangement.order.length))),
      });
      return;
    }
    if (item.item_type === 'song') {
      setMedleyModal({ anchor: { songId: item.content, title: item.title }, itemIdx: idx, existing: null });
    }
  };

  const saveMedley = ({ links, slideCount, anchorParts }) => {
    const m = medleyModal;
    if (!m) return;
    const rowId = activeService?.items?.[m.itemIdx]?.id ?? null;
    const liveMed = medleyRef.current;
    const liveRow = liveMed && rowId != null && String(liveMed.itemId) === String(rowId);
    // Normalize both link shapes (modal sends parts/skip; be liberal).
    const normLinks = (links || []).map((l) => ({
      songId: l.songId,
      title: l.title || 'Song',
      parts: l.parts !== undefined ? l.parts : l.includedParts,
      skip: l.skip !== undefined ? l.skip : l.skipTitleSlide,
    }));
    // The row subtitle names the saved parts verbatim — what you see here
    // is exactly what Go will flatten (no more guessing what got stored).
    const linkBits = normLinks.map(l => `${l.title || 'Song'} (${(l.parts && l.parts.length ? l.parts : ['ALL']).join(', ')})`);
    setActiveService((prev) => {
      const items = [...(prev?.items || [])];
      if (m.itemIdx == null || m.itemIdx < 0 || m.itemIdx >= items.length) return prev;
      const cur = items[m.itemIdx] || {};
      const keepId = cur.id != null ? { id: cur.id } : {};
      // Row arrangement survives medley re-saves (unified engine: the anchor
      // order lives in meta, the song links in content — neither clobbers).
      const keepMeta = { ...(cur.meta || {}) };
      const metaPatch = Object.keys(keepMeta).length ? { meta: keepMeta } : {};
      if (!normLinks.length) {
        // Unlinked: back to a PLAIN anchor song row — arrangement included in
        // the reset (the toast says plain, so plain it is).
        if (liveRow) medleyRef.current = null;
        const s = (songs || []).find(x => sameSongId(x.id, m.anchor.songId));
        items[m.itemIdx] = {
          ...keepId, item_type: 'song', title: m.anchor.title,
          subtitle: `${s?.artist || 'Worship'} • Song`, content: m.anchor.songId,
        };
        return { ...prev, items };
      }
      const def = {
        anchor: { songId: m.anchor.songId, includedParts: Array.isArray(anchorParts) && anchorParts.length ? anchorParts : ['ALL'] },
        links: normLinks.map(l => ({ songId: l.songId, includedParts: l.parts, skipTitleSlide: l.skip !== false })),
      };
      items[m.itemIdx] = {
        ...keepId,
        item_type: 'medley',
        title: m.anchor.title,
        subtitle: `Medley • ${linkBits.join(' + ')}`,
        content: JSON.stringify(def),
        slideCount: Math.max(1, Number(slideCount) || 1),
        ...metaPatch,
      };
      return { ...prev, items };
    });
    setMedleyModal(null);
    // Save receipt: states EXACTLY what was stored, so a "verses still play"
    // report traces to the save or the build with one screenshot.
    try {
      toast.add({
        title: 'Medley saved',
        description: linkBits.length ? linkBits.join(' + ') : 'Unlinked back to a plain song',
        type: 'success',
        duration: 6000,
      });
    } catch {}
    // Live refresh: this medley's flow is on air RIGHT NOW — rebuild it from
    // the just-saved def so the screen follows the edit. Output untouched
    // (no refire). Without this, edits only applied on the next Go.
    if (liveRow && normLinks.length) {
      const def = {
        anchor: { songId: m.anchor.songId, includedParts: Array.isArray(anchorParts) && anchorParts.length ? anchorParts : ['ALL'] },
        links: normLinks.map(l => ({ songId: l.songId, includedParts: l.parts, skipTitleSlide: l.skip !== false })),
      };
      // The row's anchor arrangement (if any) survives medley re-saves —
      // refresh through the unified loader so the flow keeps following it.
      refreshLiveMedleyFlow(rowId, { id: rowId, meta: activeService?.items?.[m.itemIdx]?.meta, content: JSON.stringify(def) });
    }
  };

  // Song-id matching, in ONE place. Service rows round-trip through a TEXT
  // column, and old plans carry float strings like "42.0" for song 42 — so
  // neither === nor String() compares match. Numeric-aware: "42", 42 and
  // "42.0" all name song 42; UUIDs still compare as strings (Number() is NaN).
  const sameSongId = (a, b) => {
    if (a == null || b == null) return false;
    if (String(a) === String(b)) return true;
    if (String(a).trim() === '' || String(b).trim() === '') return false;
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
  };

  const fireServiceItemLive = async (item) => {
    if (item && item.id == null) item.id = genServiceItemId();
    liveBibleRef.current = (item.meta && item.meta.kind === 'bible') ? item : null;
    liveBibleSrcRef.current = (item.meta && item.meta.kind === 'bible') ? (item.meta.source || null) : null;
    if (item.item_type === 'song') {
      // Arrangement session: this row carries a custom play order (v2 section
      // flow or legacy cue-id order) — the arrows walk it (see handleNextCue).
      // Anything else clears it.
      const arrObj = item.meta?.arrangement;
      const hasArr = arrObj && ((Array.isArray(arrObj.flow) && arrObj.flow.length) || (Array.isArray(arrObj.order) && arrObj.order.length));
      arrangeRef.current = hasArr ? { itemId: item.id, songId: item.content, arr: arrObj } : null;
      if (activeCue && activeCue.id !== 'clear') {
        // Output already shows something: stage this song's background first.
        // A black/cleared output just loads the song, as before.
        stageSongBackground(item.content);
      } else if (window.require) {
        // Black output: Go means GO — load the song AND fire its title, so
        // the room sees it at once and the row flips to Stop. (Staging first
        // only matters when something is already on air to dissolve from.)
        const { ipcRenderer } = window.require('electron');
        const seq = ++songLoadSeqRef.current;
        const details = repairSongBoxes(await ipcRenderer.invoke('db-get-song-details', item.content));
        if (!details || seq !== songLoadSeqRef.current) return;
        setActiveSong(details);
        fireTitleLive(details);
      } else {
        selectSong(item.content);
      }
    } else if (item.item_type === 'media') {
      arrangeRef.current = null;
      if (activeCue?.id === item.id) return;
      fireServiceMediaLive(item);
    } else if (item.item_type === 'medley') {
      arrangeRef.current = null;
      fireMedleyItemLive(item);
    } else if (item.item_type === 'presentation') {
      arrangeRef.current = null;
      firePresentationFromItem(item);
    } else {
      arrangeRef.current = null;
      if (item.meta && item.meta.kind === 'bible') lastBibleRef.current = item;
      setActiveCue({ id: item.id, label: item.subtitle, text: item.content });
      const d = Number(item.duration) || 0;
      setSlideTimer({ start: Date.now(), elapsed: 0, duration: d });
      const slidePayload = { title: item.title, text: item.content, label: item.subtitle, style: item.style || stageStyle, audio: activeSong?.audio_url || null, meta: item.meta || null, timestamp: liveStamp() };
      setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
      if (window.require && targetedDisplays.includes(1)) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('update-live-slide', slidePayload);
      }
      sendStageData({ title: item.title, label: item.subtitle, text: item.content, lyric: false, timestamp: slidePayload.timestamp }, null);
    }
  };

  // Current song sync: whenever the loaded song changes (Go, Next sliding
  // into the next song, library pick), the Stage tempo panel follows it and
  // its saved BPM is adopted into the stage metronome (drummer phones follow
  // cfg.bpm). Songs without a saved tempo leave the metronome untouched.
  useEffect(() => {
    if (isOutputWindow || activeSong == null) return;
    const saved = Math.round(Number(activeSong.bpm) || 0);
    if (saved >= 40 && saved <= 220) {
      setStageCfg((prev) => (Number(prev.bpm) === saved ? prev : { ...prev, bpm: saved }));
    }
    setStageBpmPopup({ songId: activeSong.id, title: activeSong.title || 'Song' });
  }, [activeSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Service order loaded: reflect its songs in the Stage tempo panel right
  // away — no waiting for Go. Keyed on service + song list so edits (add /
  // remove / reorder) refresh the rows without re-popping churn; an
  // already-open popup keeps its song when it is still in the order, and a
  // fired song still takes selection via the effect above.
  const svcPopRef = useRef(null);
  useEffect(() => {
    if (isOutputWindow) return;
    const items = ((activeService && activeService.items) || []).filter((i) => i && (i.item_type === 'song' || i.item_type === 'medley'));
    if (!items.length) return;
    const key = `${activeService?.id ?? 'new'}:${items.map((i) => i.id ?? i.content).join(',')}`;
    if (svcPopRef.current === key) return;
    svcPopRef.current = key;
    const songRefOf = (it) => {
      if (it.item_type === 'song') return String(it.content ?? '').trim();
      if (it.item_type === 'medley') {
        const def = parseMedleyDef(it);
        return def && def.anchor && def.anchor.songId != null ? String(def.anchor.songId).trim() : '';
      }
      return '';
    };
    const firstId = songRefOf(items[0]);
    if (!firstId) return;
    setStageBpmPopup((prev) => {
      if (prev && items.some((i) => songRefOf(i) === String(prev.songId))) return prev;
      return { songId: firstId, title: items[0].title || 'Song' };
    });
  }, [activeService]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizeDisplay = (displayId) => {
    if (displayId === null || displayId === undefined || displayId === '') return null;
    if (displayId === 'preview') return 'preview';
    return Number(displayId);
  };

  const updateOutput = (id, patch) => {
    setOutputs(prev => {
      const next = prev.map(o => (o.id === id ? { ...o, ...patch } : o));
      // Assigning a physical display moves it: never leave two outputs on the
      // same screen, where the covered one's controls look broken.
      const d = patch && patch.displayId;
      if (d == null || d === '' || d === 'preview') return next;
      const key = String(d);
      return next.map(o => (
        o.id !== id && String(o.displayId) === key ? { ...o, displayId: null, enabled: false } : o
      ));
    });
  };

  const addOutput = () => {
    setOutputs(prev => {
      const id = `out-${Math.random().toString(36).slice(2, 8)}`;
      // A second output is another picture of the SAME service, so start it
      // with the main output's resolution/aspect. Otherwise it begins on
      // "Native" and silently looks different from the wall the operator just
      // configured.
      const main = prev.find(o => o.id === 'projector') || prev.find(o => o.role === 'lyrics') || prev[0] || {};
      return [...prev, {
        id,
        name: `Output ${prev.length + 1}`,
        role: 'lyrics',
        displayId: null,
        enabled: false,
        resolution: main.resolution || 'native',
        aspect: main.aspect || 'auto'
      }];
    });
  };

  const removeOutput = (id) => {
    setOutputs(prev => prev.filter(o => o.id !== id));
  };

  // Outputs never auto-open on launch: `enabled` is runtime-only (stripped when
  // saved) and starts false, so the operator must explicitly start each output.
  const setOutputRunning = (id, running) => {
    setOutputs(prev => {
      const target = prev.find(o => o.id === id);
      if (!target) return prev;
      // A display can only show one fullscreen output. If another output owns
      // the display this one is about to use, hand the display over instead of
      // stacking two windows (the covered one then looks like its settings do
      // nothing). Starting an unassigned output picks the first display that
      // is not CURRENTLY showing an output — a stopped output's stale
      // assignment must not push the new picture into a tiny dev-preview
      // window (that is how a real projector ended up on the primary screen
      // at the wrong resolution).
      const used = new Set(prev
        .filter(o => o.id !== id && o.enabled && o.displayId != null && o.displayId !== 'preview')
        .map(o => String(o.displayId)));
      const free = (outputDisplays || []).find(d => !used.has(String(d.id)));
      const displayId = running && !target.displayId
        ? (free ? free.id : 'preview')
        : target.displayId;
      return prev.map(o => {
        if (o.id === id) {
          return { ...o, enabled: !!running, displayId: running ? displayId : o.displayId };
        }
        if (running && displayId != null && displayId !== 'preview' && String(o.displayId) === String(displayId)) {
          return { ...o, displayId: null, enabled: false };
        }
        return o;
      });
    });
  };

  // Screen sermons (slideshow behind the lyrics output): same functional
  // discipline as every other updater — geometry of the call never depends
  // on which render created it.
  const sermonSetLayer = (layer) => {
    const anyLive = (outputs || []).some(o => o.role === 'lyrics' && o.enabled);
    if (!anyLive) {
      setSermon((prev) => ({ ...prev, error: 'Start an output first — there is no projector window to layer.' }));
      return;
    }
    if (window.require) {
      window.require('electron').ipcRenderer.send('output-set-layer', { all: true, layer });
    }
    // Optimistic; main's output-layer echo (or the poll below) confirms.
    setSermon((prev) => ({ ...prev, passthrough: layer === 'passthrough', error: null }));
  };

  const sermonLoad = async (filePath) => {
    if (!window.require) return;
    setSermon((prev) => ({ ...prev, busy: true, error: null }));
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('ppt-load', filePath || undefined);
    if (res && res.canceled) {
      setSermon((prev) => ({ ...prev, busy: false }));
      return;
    }
    if (res && res.ok) {
      clearSermonShots();
      setSermon((prev) => ({
        ...prev, loaded: true, busy: false, error: null,
        file: res.file || prev.file,
        title: String(res.file || '').split(/[/\\]/).pop() || 'Sermon',
        total: res.totalSlides || 0, index: res.index || 1,
        displayLabel: res.displayLabel || '',
        provider: res.provider || '',
      }));
    } else {
      clearSermonShots();
      setSermon((prev) => ({ ...prev, busy: false, error: (res && res.error) || 'Could not open the presentation.' }));
    }
  };

  const sermonApplyNav = (res) => {
    if (!res) return;
    if (res.ok) {
      setSermon((prev) => ({ ...prev, index: res.index || prev.index, total: res.totalSlides || prev.total, error: null }));
    } else if (res.error) {
      setSermon((prev) => ({ ...prev, error: res.error }));
    }
  };

  const sermonNav = async (dir) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    sermonApplyNav(await ipcRenderer.invoke(dir > 0 ? 'ppt-next' : 'ppt-prev'));
  };

  const sermonGoto = async (n) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    sermonApplyNav(await ipcRenderer.invoke('ppt-goto', n));
  };

  // Operator slide thumbnails for the Presentation tab (current + next).
  // Cache: string = image ready, null = export failed (don't retry-storm),
  // missing = not tried yet. Keyed by slide number only, so it is cleared
  // on every load and close — never a stale deck's slides.
  const [sermonShots, setSermonShots] = useState({});
  const sermonShotsRef = useRef({});
  const clearSermonShots = () => {
    sermonShotsRef.current = {};
    sermonShotCoolRef.current = 0;
    sermonShotFailsRef.current = 0;
    setSermonShots({});
  };

  // Debounced so arrow-spam only exports the settled slide, not every
  // intermediate one (each export costs a COM round-trip). Fetches current +
  // next together; failures cache as null so the panel shows "unavailable"
  // instead of spinning forever.
  // Crash guard: a slideshow app can fall over if Export lands mid-transition
  // or hammers a struggling deck, so exports wait until navigation has settled
  // (900ms), batches stay ≥2.5s apart, and 3 consecutive failures silence
  // exports for the rest of the deck (cleared on load). Current + next go
  // first, then the filmstrip backfill follows in the same batch.
  // Navigation itself never waits on any of this.
  const sermonShotCoolRef = useRef(0);
  const sermonShotFailsRef = useRef(0);
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    if (!sermon.loaded || !sermon.index || sermon.index < 1) return;
    if (sermonShotFailsRef.current >= 3) return;
    const wait = Math.max(900, 2500 - (Date.now() - sermonShotCoolRef.current));
    let dead = false;
    const t = setTimeout(async () => {
      const { ipcRenderer } = window.require('electron');
      // Current + next first (what the operator is looking at), then the rest
      // of the deck in order so the filmstrip fills in behind. Cached slides
      // (images AND failures) are skipped, so re-runs cost nothing.
      const ordered = [sermon.index, sermon.index + 1];
      if (sermon.total) for (let k = 1; k <= sermon.total; k++) ordered.push(k);
      const seen = new Set();
      const want = ordered.filter((i) => {
        if (seen.has(i)) return false;
        seen.add(i);
        return i >= 1 && (!sermon.total || i <= sermon.total);
      });
      sermonShotCoolRef.current = Date.now();
      for (const idx of want) {
        if (dead) return;
        if (idx in sermonShotsRef.current) continue;
        try {
          const r = await ipcRenderer.invoke('ppt-shot', idx);
          if (dead) return;
          const url = r && r.ok && r.dataUrl ? r.dataUrl : null;
          if (url) sermonShotFailsRef.current = 0;
          else sermonShotFailsRef.current += 1;
          sermonShotsRef.current[idx] = url;
          setSermonShots((prev) => ({ ...prev, [idx]: url }));
        } catch {
          if (dead) return;
          sermonShotFailsRef.current += 1;
          sermonShotsRef.current[idx] = null;
          setSermonShots((prev) => ({ ...prev, [idx]: null }));
        }
      }
    }, wait);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOutputWindow, sermon.loaded, sermon.index, sermon.total, sermon.file]);

  const sermonClose = async () => {
    if (window.require) {
      try { await window.require('electron').ipcRenderer.invoke('ppt-close'); } catch {}
    }
    // Leave the wall showing lyrics, never a dead slideshow frame.
    sermonSetLayer('kog');
    clearSermonShots();
    setSermon({ loaded: false, file: null, title: '', total: 0, index: 0, error: null, busy: false, displayLabel: '', passthrough: false, provider: '' });
  };

  const toggleDevProjectorWindow = () => {
    const current = outputs.find(o => o.id === 'projector');
    if (!current) return;
    setOutputRunning('projector', !current.enabled);
  };

  const selectOutputDisplay = (displayId) => {
    const d = normalizeDisplay(displayId);
    updateOutput('projector', { displayId: d, enabled: d !== null });
  };

  const selectStageDisplay = (displayId) => {
    const d = normalizeDisplay(displayId);
    updateOutput('stage', { displayId: d, enabled: d !== null });
  };

  const toggleStageWindow = () => {
    const current = outputs.find(o => o.id === 'stage');
    if (!current) return;
    setOutputRunning('stage', !current.enabled);
  };

  // Insert a non-header item after the last item of the target section
  // (or append when no target / target missing). `targetOverride` lets the
  // scripture "Add to Playlist" dialog name its destination explicitly —
  // undefined means "the section the operator is working in", null means
  // "end of show".
  const insertServiceItem = (newItem, targetOverride) => {
    if (newItem && newItem.id == null) newItem.id = genServiceItemId();
    setActiveService(prev => {
      const items = [...(prev?.items || [])];
      const target = targetOverride !== undefined ? targetOverride : serviceTargetTitle;
      // '__start__' = the group before the first section header (the picker's
      // synthetic "General"), NOT the end of the show.
      if (target === '__start__') {
        const firstHeader = items.findIndex(i => i.item_type === 'section_header');
        items.splice(firstHeader === -1 ? items.length : firstHeader, 0, newItem);
        return { ...prev, items };
      }
      if (!target) {
        items.push(newItem);
        return { ...prev, items };
      }
      const headerIdx = items.findIndex(i => i.item_type === 'section_header' && i.title === target);
      if (headerIdx === -1) {
        items.push(newItem);
        return { ...prev, items };
      }
      let insertAt = items.length;
      for (let i = headerIdx + 1; i < items.length; i++) {
        if (items[i].item_type === 'section_header') { insertAt = i; break; }
      }
      items.splice(insertAt, 0, newItem);
      return { ...prev, items };
    });
  };

  const serviceSectionTitles = () => (activeService?.items || [])
    .filter(i => i.item_type === 'section_header')
    .map(i => i.title);

  const addSongToService = (song) => {
    const newItem = { item_type: 'song', title: song.title, subtitle: `${song.artist || 'Worship'} • Song`, content: song.id };
    insertServiceItem(newItem);
  };

  const addHeaderToService = (headerTitle) => {
    const newItem = { item_type: 'section_header', title: headerTitle, subtitle: 'Section Flow', content: '' };
    setActiveService(prev => ({ ...prev, items: [...(prev?.items || []), newItem] }));
    setServiceTargetTitle(headerTitle);
  };

  // Rename a section header in place. Collapse keys are title-based, so keep
  // them in sync when the section is renamed while collapsed.
  const renameServiceHeader = (idx, title) => {
    // Functional: a reorder landing between read and write must not rename
    // the wrong row — the guard re-checks the header at commit time.
    setActiveService((prev) => {
      const items = [...(prev?.items || [])];
      if (!items[idx] || items[idx].item_type !== 'section_header') return prev;
      const oldTitle = items[idx].title;
      const nextTitle = title || 'Section';
      items[idx] = { ...items[idx], title: nextTitle };
      if (oldTitle !== nextTitle) {
        setServiceCollapsed((prevC) => prevC.map((t) => (t === oldTitle ? nextTitle : t)));
      }
      return { ...prev, items };
    });
  };

  const openCustomSlideEditor = (index = null) => {
    if (index == null) {
      setCustomSlideEditIdx(null);
      setNewSlideData(defaultCustomSlideData());
    } else {
      const item = (activeService?.items || [])[index];
      if (!item || item.item_type !== 'custom_slide') return;
      setCustomSlideEditIdx(index);
      setNewSlideData({
        title: item.title || '',
        subtitle: item.subtitle || '',
        content: item.content || '',
        style: normalizeCustomSlideStyle(item.style),
      });
    }
    setCustomSlideModal(true);
  };

  const closeCustomSlideEditor = () => {
    setCustomSlideModal(false);
    setCustomSlideEditIdx(null);
  };

  const addCustomSlideToService = () => {
    const style = normalizeCustomSlideStyle(newSlideData.style);
    const title = (newSlideData.title || '').trim() || 'Slide';
    const subtitle = (newSlideData.subtitle || '').trim() || 'Service Slide';
    const content = newSlideData.content || '';
    if (customSlideEditIdx != null) {
      const cur = (activeService?.items || [])[customSlideEditIdx];
      if (!cur || cur.item_type !== 'custom_slide') { closeCustomSlideEditor(); return; }
      const updated = { ...cur, title, subtitle, content, style };
      setActiveService((prev) => {
        const items = [...(prev?.items || [])];
        if (!items[customSlideEditIdx]) return prev;
        items[customSlideEditIdx] = updated;
        return { ...prev, items };
      });
      // Editing the slide that is ON AIR re-fires it, so the wall shows the new
      // look immediately instead of waiting for Stop → Go.
      if (activeCue?.id === cur.id) fireServiceItemLive(updated);
    } else {
      insertServiceItem({ item_type: 'custom_slide', title, subtitle, content, style });
    }
    setCustomSlideModal(false);
    setCustomSlideEditIdx(null);
    setNewSlideData(defaultCustomSlideData());
  };

  const addPresentationToService = (deck) => {
    const count = (deck.slides || []).length;
    const newItem = {
      item_type: 'presentation',
      title: deck.title || 'Presentation',
      subtitle: `Presentation • ${count} slide${count === 1 ? '' : 's'}`,
      content: JSON.stringify(deck)
    };
    insertServiceItem(newItem);
  };

  const reorderServiceItem = (from, to) => {
    if (from === null || from === undefined || from === to) return;
    // Functional: two quick drags must each see the other's result, never the
    // same stale array (which silently dropped one of the moves).
    setActiveService((prev) => {
      const items = [...(prev?.items || [])];
      if (from < 0 || from >= items.length || to < 0 || to > items.length) return prev;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...prev, items };
    });
    setDragIndex(null);
  };

  const moveServiceBlock = (fromIdx, toIdx) => {
    setActiveService((prev) => {
      const items = [...(prev?.items || [])];
      // toIdx === items.length is legal: it is how a drop past the last row
      // (or into an empty trailing section) says "append to the end".
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx > items.length) return prev;
      const isHeader = items[fromIdx] && items[fromIdx].item_type === 'section_header';
      let end;
      if (isHeader) {
        const ni = items.findIndex((it, i) => i > fromIdx && it.item_type === 'section_header');
        end = ni === -1 ? items.length : ni;
      } else {
        end = fromIdx + 1;
      }
      const block = items.slice(fromIdx, end);
      const rest = items.slice(0, fromIdx).concat(items.slice(end));
      let at = toIdx;
      if (toIdx > fromIdx) at = toIdx - block.length;
      const clamped = Math.max(0, Math.min(at, rest.length));
      const result = rest.slice(0, clamped).concat(block).concat(rest.slice(clamped));
      return { ...prev, items: result };
    });
    setDragIndex(null);
  };

  const moveServiceItem = (index, direction) => {
    setActiveService((prev) => {
      const newItems = [...(prev?.items || [])];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newItems.length) return prev;
      const temp = newItems[index];
      newItems[index] = newItems[targetIndex];
      newItems[targetIndex] = temp;
      return { ...prev, items: newItems };
    });
  };

  const removeServiceItem = (index) => {
    setActiveService((prev) => ({ ...prev, items: (prev?.items || []).filter((_, i) => i !== index) }));
  };

  // --- SERVICE ORDER (G-Presenter style) ---
  const serviceOrderCount = () => (activeService?.items || []).filter(i => i.item_type !== 'section_header').length;
  const serviceSlideCount = (item) => {
    // Medleys carry their flattened count from link time (refreshed on Go);
    // songs count title + cues, matching the grid and builder.
    if (item.item_type === 'medley') return Number(item.slideCount) || 1;
    if (item.item_type === 'song') {
      // Arranged rows count title + custom order, matching what Go walks.
      // v2 flows carry their expanded slideCount from save time (the library
      // list has no cues to count from); legacy orders count their ids.
      const ma = item.meta?.arrangement;
      if (ma && ((Array.isArray(ma.flow) && ma.flow.length) || (Array.isArray(ma.order) && ma.order.length))) {
        if (Number(ma.slideCount) > 0) return Number(ma.slideCount) + 1;
        return ((ma.flow || ma.order) || []).length + 1;
      }
      // Numeric-aware match (see sameSongId): reloaded plans hold "42.0"
      // where the library holds 42.
      const song = songs.find(s => sameSongId(s.id, item.content));
      // +1 for the title card: firing starts there (fireTitleLive), and the
      // grid/builder both count it — the badge used to read one short.
      return song ? (song.cues || []).length + 1 : 0;
    }
    if (item.item_type === 'presentation') {
      try { const d = JSON.parse(item.content); return (d.slides || []).length; } catch (_) { return 0; }
    }
    if (item.item_type === 'custom_slide' || item.item_type === 'media') return 1;
    return 0;
  };
  const serviceStatusIcon = (item) => {
    if (item.item_type === 'song') return '♪';
    if (item.item_type === 'media') return '▤';
    if (item.item_type === 'presentation') return '▦';
    return '▤';
  };
  // --- ONE service item on air at a time ---------------------------------
  // Songs are tracked by `activeSong` while every other type is tracked by
  // `activeCue`, so the two never knew about each other: fire a song, then an
  // image, and BOTH rows lit up "Stop" even though only one thing was on the
  // screen. The row state has to be derived from what the output is actually
  // showing, so exactly one item can ever win. A cue id that belongs to a
  // service item names that item outright; otherwise only the selected song
  // counts, and only while the output is still showing that song (its title,
  // a verse, or the standby background) rather than something else.
  const liveServiceItem = (() => {
    const items = (activeService?.items || []).filter(Boolean);
    if (!items.length || !activeCue || activeCue.id === 'clear') return null;
    // A medley session names its own row outright — the live cue belongs to
    // one of its linked songs, which a plain song row could also claim.
    const med = medleyRef.current;
    if (med && med.slides.length) {
      const s = med.slides[med.index];
      const mine = s && ((s.cue && s.cue.id === activeCue.id) || (!s.cue && activeCue.id === medleyTitleId(s.songId)));
      if (mine) return items.find(i => i.id === med.itemId) || null;
    }
    const songRow = () => (activeSong
      ? items.find(i => i.item_type === 'song' && sameSongId(i.content, activeSong.id))
      : null) || null;
    // Standby / title slide only ever come from a song.
    if (activeCue.id === 'standby' || activeCue.id === 'title-card') return songRow();
    const byCue = items.find(i => i.id != null && i.id === activeCue.id);
    if (byCue) return byCue;
    // A song's own verse is on air: still that song's row, not nothing.
    if (activeSong && (activeSong.cues || []).some(c => c.id === activeCue.id)) return songRow();
    // Verse belongs to a medley-linked song but no session is tracking it
    // (e.g. fired from the grid after the medley ended): light the medley row
    // so Stop still lands in the right place.
    if (activeSong) {
      const medRow = items.find(i => {
        if (i.item_type !== 'medley') return false;
        const def = parseMedleyDef(i);
        return def ? medleySongIds(def).some(id => sameSongId(id, activeSong.id)) : false;
      });
      if (medRow) return medRow;
    }
    return null;
  })();

  const serviceItemIsLive = (item) => {
    if (!item || !liveServiceItem) return false;
    if (liveServiceItem === item) return true;
    return liveServiceItem.id != null && item.id != null && liveServiceItem.id === item.id;
  };
  const toggleServiceCollapse = (title) => {
    setServiceCollapsed(prev => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]);
  };
  const expandAllServiceSections = () => setServiceCollapsed([]);
  const collapseAllServiceSections = () => setServiceCollapsed(serviceSections().map(s => s.title));
  const clearServiceOrder = async () => {
    if (!(await appConfirm('Clear the entire service order?', { confirmLabel: 'Clear' }))) return;
    setServiceCollapsed([]);
    setActiveService({ ...activeService, items: [] });
  };
  const addMediaItemToService = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (!url) { await appAlert('Could not copy that media file. Try another image or video.'); if (e.target) e.target.value = ''; return; }
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const newItem = { item_type: 'media', title: file.name.replace(/\.[^.]+$/, '') || 'Media', subtitle: kind === 'video' ? 'Video' : 'Image', content: '', media_type: kind, media_url: url };
    insertServiceItem(newItem);
    if (e.target) e.target.value = '';
    setServiceAddMenu(null);
  };
  // Add an image/video that is ALREADY in the app's media library to the
  // service order — no file dialog, no duplicate copy on disk.
  const addExistingMediaToService = (asset) => {
    if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return;
    let title = asset.name || '';
    if (!title) {
      try { title = decodeURIComponent(String(asset.url).split('/').pop().split('?')[0]).replace(/\.[^.]+$/, ''); } catch (_) { title = ''; }
    }
    const newItem = { item_type: 'media', title: title || 'Media', subtitle: asset.kind === 'video' ? 'Video' : 'Image', content: '', media_type: asset.kind, media_url: asset.url };
    insertServiceItem(newItem);
    setServiceAddMenu(null);
    setServiceMediaPicker(false);
  };
  const fireServiceMediaLive = (item) => {
    if (!item || item.item_type !== 'media') return;
    const mediaUrl = item.media_url
      || (() => {
        try { const j = JSON.parse(item.content || ''); return j && j.media_url ? j.media_url : null; } catch (_) { return null; }
      })();
    const mediaType = item.media_type
      || (() => {
        try { const j = JSON.parse(item.content || ''); return j && j.media_type ? j.media_type : null; } catch (_) { return null; }
      })();
    if (!mediaUrl) {
      appAlert('This media item has no file link (saved before media URLs were stored). Re-add the file via Local Media, then Save Plan.');
      return;
    }
    const bgType = mediaType === 'video' ? 'video' : 'image';
    const slidePayload = { title: item.title, text: '', label: item.subtitle || 'Media', style: { ...stageStyle, backgroundType: bgType, backgroundValue: mediaUrl }, audio: activeSong?.audio_url || null, media: true, timestamp: liveStamp() };
    setActiveCue({ id: item.id, label: item.subtitle || 'Media', text: '' });
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
    if (window.require && (targetedDisplays.includes(1) || true)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    sendStageData({ title: item.title, label: item.subtitle || 'Media', text: '', lyric: false, media: true, timestamp: slidePayload.timestamp }, null);
  };

  // Clear the workspace: unload the song from the center grid back to the
  // welcome state. Operator surface only — the live output is NEVER touched
  // (blackout stays an explicit Clear Lyrics / Clear All decision), so the
  // live cue is kept and the status pill stays honest.
  const clearWorkspace = () => { setActiveSong(null); };

  const stopServiceItemLive = (item) => {
    if (!serviceItemIsLive(item)) return;
    // Medley stop: same blackout as a song, plus the session ends so arrows
    // go back to the grid instead of walking a dead flow.
    if (item.item_type === 'medley') {
      medleyRef.current = null;
      setActiveSong(null);
      setActiveCue({ id: 'clear', label: 'Clear', text: '' });
      setSlideTimer({ start: null, elapsed: 0, duration: 0 });
      const slidePayload = { title: '', artist: '', text: '', label: 'Clear', style: { ...stageStyle, backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '600ms' }, audio: null, timestamp: liveStamp() };
      setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
      if (window.require && targetedDisplays.includes(1)) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('update-live-slide', slidePayload);
      }
      sendStageData({ title: '', label: 'Clear', text: '', lyric: false, timestamp: slidePayload.timestamp }, null);
      return;
    }
    if (item.item_type === 'song') {
      // Arrangement session ends with the song — arrows go back to the grid.
      arrangeRef.current = null;
      setActiveSong(null);
      setActiveCue({ id: 'clear', label: 'Clear', text: '' });
      setSlideTimer({ start: null, elapsed: 0, duration: 0 });
      const slidePayload = { title: '', artist: '', text: '', label: 'Clear', style: { ...stageStyle, backgroundType: 'color', backgroundValue: '#000000', transition: 'fade', speed: '600ms' }, audio: null, timestamp: liveStamp() };
      setDisplays((prev) => prev.map((d) => (targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d)));
      if (window.require && targetedDisplays.includes(1)) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('update-live-slide', slidePayload);
      }
      sendStageData({ title: '', label: 'Clear', text: '', lyric: false, timestamp: slidePayload.timestamp }, null);
      return;
    }
    fireCueLive({ id: 'clear', label: 'Clear', text: '' });
  };

  // --- SERVICE PLAN DIRTY TRACKING ---------------------------------------
  // The working order vs the last saved/loaded state. Volatile fields are
  // stripped from the comparison: row `id`s (fireServiceItemLive assigns
  // them in place on Go — going live must NOT dirty the plan) and medley
  // `slideCount`s (recomputed from reality on every Go).
  const servicePlanSnap = (svc) => {
    try {
      return JSON.stringify({
        name: svc?.name || '',
        items: (svc?.items || []).map((it) => {
          if (!it || typeof it !== 'object') return it;
          const { id: _id, slideCount: _n, ...rest } = it;
          return rest;
        }),
      });
    } catch {
      return null;
    }
  };
  const serviceSnapRef = useRef(null);
  // If boot recovery adopted a plan, remember its toast so choosing "Start
  // Blank" can take the (now untrue) "recovered" notice off the screen.
  const serviceRecoveredToastRef = useRef(null);
  const [serviceDirty, setServiceDirty] = useState(false);
  // Re-entrant X guard: a second close request while the quit dialog is open
  // is ignored (the first dialog owns the decision).
  const closeDecidingRef = useRef(false);
  // --- SERVICE PLAN AUTOSAVE -----------------------------------------------
  // Until now the plan was the only piece of live Sunday work with NO safety
  // net: a crash mid-drag took the whole running order with it, while the Song
  // Editor kept a draft. Same shape as that guard — mirror while dirty, clear
  // the instant the work is safe — with one structural difference: a plan has
  // no "open" event, it is simply what the console starts on, so recovery runs
  // when the splash clears instead.
  const serviceDraftGenRef = useRef(0);
  const clearServiceDraft = () => {
    // Generation bump kills a mirror write already sitting in the debounce
    // timer: without it, a drag that landed 600ms before Save could fire
    // DURING the save's await and put the entry straight back after this
    // removed it.
    serviceDraftGenRef.current += 1;
    try { localStorage.removeItem(SERVICE_DRAFT_KEY); } catch {}
  };
  const markServicePlanSaved = (svc) => {
    const snap = servicePlanSnap(svc);
    if (snap !== null) {
      serviceSnapRef.current = snap;
      setServiceDirty(false);
      clearServiceDraft(); // the work is safely in the database now
    }
  };

  // "Start Blank" is an explicit choice, not just a welcome-screen dismissal.
  // Boot recovery may already have adopted an unsaved plan from the crash-safe
  // mirror while the welcome screen was up; starting blank must drop that plan
  // (and its draft) instead of showing the operator last session's order. The
  // snapshot is rebased so the empty plan reads clean — there is nothing to
  // save or recover until they build something.
  const startBlankWorkspace = () => {
    clearServiceDraft();
    if (serviceRecoveredToastRef.current != null) {
      toast.close(serviceRecoveredToastRef.current);
      serviceRecoveredToastRef.current = null;
    }
    serviceSnapRef.current = null;
    setServiceDirty(false);
    setSelectedServiceId('');
    setServiceCollapsed([]);
    setActiveService(blankServicePlan());
    setShowWelcome(false);
  };

  // Boot recovery. Declared BEFORE the dirty-tracking effect below on purpose:
  // it queues the recovered plan while that effect is still baselining the
  // blank opening order, so what comes back reads as UNSAVED work — which is
  // exactly what it is, and what earns it the quit-gate prompt and the
  // load-another-show guard.
  // isOutputWindow first: projector/stage/output windows share this component
  // and localStorage, and must never adopt (or announce) the operator's plan.
  useEffect(() => {
    if (isOutputWindow || showSplash) return;
    // First launch stays blank by default: never resurrect a previous order.
    if (firstRunBoot) return;
    let draft = null;
    try {
      const raw = localStorage.getItem(SERVICE_DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { draft = null; }
    const svc = draft && typeof draft === 'object' ? draft.service : null;
    if (!svc || !Array.isArray(svc.items) || !svc.items.length) return; // nothing worth recovering
    setActiveService(svc);
    const at = Number(draft.at) || Date.now();
    serviceRecoveredToastRef.current = toast.add({
      type: 'info',
      title: 'Service plan recovered',
      description: `Picked up from ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — Save to keep it.`,
    });
  }, [showSplash, isOutputWindow]);

  // Mirror, debounced. Only ever while dirty: writing a clean plan would
  // overwrite a real recovery draft with a copy of nothing.
  useEffect(() => {
    if (isOutputWindow || !serviceDirty || !activeService) return;
    const gen = serviceDraftGenRef.current;
    const t = setTimeout(() => {
      if (gen !== serviceDraftGenRef.current) return; // cleared while we waited
      try {
        localStorage.setItem(SERVICE_DRAFT_KEY, JSON.stringify({ at: Date.now(), service: activeService }));
      } catch { /* quota: recovery is best-effort and must never throw */ }
    }, 700);
    return () => clearTimeout(t);
  }, [activeService, serviceDirty, isOutputWindow]);

  useEffect(() => {
    const snap = servicePlanSnap(activeService);
    if (snap === null) return;
    if (serviceSnapRef.current === null) {
      // Boot: the opening blank order is clean by definition.
      serviceSnapRef.current = snap;
      setServiceDirty(false);
      return;
    }
    setServiceDirty(snap !== serviceSnapRef.current);
  }, [activeService]);

  const saveCurrentService = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      // Snapshot FIRST: rows added while the save is in flight belong to the
      // next save, not this one — but they must survive it. The id lands via
      // functional update so concurrent inserts aren't clobbered.
      const snap = activeService;
      const savedId = await ipcRenderer.invoke('db-save-service', snap);
      setActiveService((prev) => ({ ...(prev || snap), id: savedId }));
      markServicePlanSaved({ ...(snap || {}), id: savedId });
      fetchServices();
      await appAlert('Service plan saved successfully!');
    }
  };

  const loadService = async (serviceId) => {
    // Unsaved work guard: loading a show REPLACES the working order — even
    // when it is the show already loaded, because that re-read overwrites every
    // edit made since. The `serviceId !== activeService?.id` exception that
    // used to sit here meant clicking a recovered plan's OWN row silently threw
    // the recovery away.
    if (serviceDirty) {
      const ok = await appConfirm(
        `Load this show? Unsaved changes to "${activeService?.name || 'the service order'}" will be lost.`,
        { confirmLabel: 'Discard & Load' }
      );
      if (!ok) return;
      // They chose to abandon it — drop the recovery copy along with it, or it
      // would be offered back on the next boot for work they just declined.
      clearServiceDraft();
    }
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-service-details', serviceId);
      if (details) {
        setActiveService(details);
        markServicePlanSaved(details);
      }
    }
  };

  // Quit gate: main blocks operator-window close and asks here. Clean plan →
  // quit now; dirty plan → Save & Quit / Quit Without Saving / Cancel.
  // Update installs bypass in main (forceQuit) and never reach this dialog.
  // Placed AFTER saveCurrentService (dep array reads it at render — anything
  // earlier is TDZ-dead). Deps re-subscribe on change so Save always writes
  // the CURRENT plan; a stale closure here would save an outdated order.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onCloseRequest = async () => {
      if (closeDecidingRef.current) return;
      closeDecidingRef.current = true;
      try {
        // The Song Editor sits ON TOP of everything, so while it is the only
        // thing dirty it has to be asked about — otherwise an operator could
        // close the app from inside the editor and never be told they never
        // saved. Nothing is actually lost either way: a dirty draft stays in
        // localStorage and is offered back the next time that song opens.
        // When the plan is ALSO dirty the plan dialog below owns the decision,
        // which keeps this to at most one prompt.
        if (!serviceDirty) {
          if (isSongDraftDirty()) {
            const ok = await appConfirm(
              `"${editingSongRef.current?.title || 'This song'}" has unsaved changes.\n\nThey are kept as a recoverable draft and offered back the next time you open it.`,
              { title: 'Unsaved song', confirmLabel: 'Keep Draft & Quit', cancelLabel: 'Cancel' }
            );
            if (!ok) return;
          }
          ipcRenderer.send('app-close-decision', 'quit');
          return;
        }
        const choice = await appChoice(
          `"${activeService?.name || 'Service order'}" has unsaved changes.\n\nSave the plan before quitting?`,
          { title: 'Unsaved service order', confirmLabel: 'Quit Without Saving', cancelLabel: 'Cancel', extraLabel: 'Save & Quit' }
        );
        if (choice === 'extra') {
          await saveCurrentService();
          ipcRenderer.send('app-close-decision', 'quit');
        } else if (choice === true) {
          ipcRenderer.send('app-close-decision', 'quit');
        }
        // Cancel → stay; main keeps the window open.
      } finally {
        closeDecidingRef.current = false;
      }
    };
    ipcRenderer.on('app-close-request', onCloseRequest);
    return () => ipcRenderer.removeListener('app-close-request', onCloseRequest);
  }, [isOutputWindow, serviceDirty, activeService, appChoice, appConfirm, saveCurrentService]);

  // Step 5 (FreeShow flow): queue a saved show into the active Service Plan
  const queueShowIntoService = async (showId, insertAtEnd = true) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-service-details', showId);
      if (!details) return;
      const toAdd = (prevItems) => [...(prevItems.length ? [{ item_type: 'section_header', title: details.name, subtitle: 'Show', content: '', duration: 0 }] : []), ...(details.items || [])];
      // Functional: rows the operator added while details were loading merge
      // with the queued show instead of being overwritten by this closure's
      // stale copy.
      setActiveService((prev) => {
        const target = prev?.items || [];
        return { ...(prev || { id: null, name: '', date: '' }), items: insertAtEnd ? [...target, ...toAdd(target)] : [...toAdd(target), ...target] };
      });
    }
  };

  // --- HYBRID AI / FALLBACK SMART AUTO-PASTE PARSER ---
  // Works for chord charts AND plain lyrics — with or without section
  // Regex-Primary paste: the LOCAL engine runs by default — instant, fully
  // offline, no key, no model, no IPC round-trip (the parser is bundled into
  // the renderer too). Whatever the text is — chord chart, marked lyrics or
  // plain walls — it is normalised and split to linesPerSlide through the
  // shared parser in electron/songParse.js.
  // `opts.linesPerSlide` lets the split prompt run THIS parse with the number
  // just confirmed — setState alone would still be stale inside this closure.
  const processAutoPaste = async (textOverride, opts = {}) => {
    const text = (typeof textOverride === 'string') ? textOverride : rawPasteText;
    if (!text || !text.trim()) {
      await appAlert("Please paste lyrics or a chord chart first!");
      return;
    }

    const nLines = Math.max(1, Math.floor(Number(opts.linesPerSlide ?? linesPerSlide) || 4));
    setIsParsing(true);
    try {
      let cues = splitCuesByLines(parseSongBlocks(text, nLines), nLines);
      setAiStatus('Local Parser (Offline)');
      if (cues.length === 0) cues = [{ label: 'Verse 1', text }];

      // Both parse engines land here: give every block the default size and a
      // box fitted to its own text at that size, so the lyrics draw at the
      // full 140px instead of being shrunk into the stock box.
      cues = cues.map(fitParsedCue);

      setEditingSong(prev => ({
        ...prev,
        cues,
        // The parser drops the "CCLI #…" footer line from slides (it's site
        // chrome, not lyrics) — lift it into the song's CCLI field HERE,
        // before it is lost. Only when empty: a number the operator typed by
        // hand is never overwritten by a re-paste.
        ccli: (prev.ccli == null || String(prev.ccli).trim() === '') ? (extractCcli(text) || prev.ccli) : prev.ccli,
      }));
      return cues;
    } finally {
      setIsParsing(false);
    }
  };

  // Gemini on-demand Auto-Fix: runs ONLY when the operator explicitly clicks
  // it after poor Regex results. Never automatic, never a fallback chain —
  // failures alert and leave the local blocks untouched.
  const processAiAutofix = async (textOverride, opts = {}) => {
    const text = (typeof textOverride === 'string') ? textOverride : rawPasteText;
    if (!text || !text.trim()) {
      await appAlert("Please paste lyrics or a chord chart first!");
      return;
    }
    if (!window.require) return;

    const nLines = Math.max(1, Math.floor(Number(opts.linesPerSlide ?? linesPerSlide) || 4));
    setIsParsing(true);
    try {
      const { ipcRenderer } = window.require('electron');
      const status = await ipcRenderer.invoke('gemini-status').catch(() => null);
      if (!status?.hasKey) {
        await appAlert("AI Auto-Fix needs your free Gemini key — paste it in the key box above first. Parsing stays local until then.");
        return;
      }
      const result = await ipcRenderer.invoke('ai-autofix-song', { text, linesPerSlide: nLines });
      if (!result || result.error || !Array.isArray(result.cues) || result.cues.length === 0) {
        await appAlert(`AI Auto-Fix failed: ${(result && result.error) || 'no usable sections.'}\n\nYour local blocks are untouched.`);
        return;
      }
      let cues = splitCuesByLines(result.cues, nLines);
      if (cues.length === 0) cues = [{ label: 'Verse 1', text }];
      cues = cues.map(fitParsedCue);
      setAiStatus(result.modelUsed || 'Gemini Auto-Fix (Online)');
      setEditingSong(prev => ({ ...prev, cues }));
      return cues;
    } finally {
      setIsParsing(false);
    }
  };

  // ----------------------------------------------------

  const moveCue = (idx, dir) => {
    const target = idx + dir;
    // Functional: a throttled slider write landing between read and commit
    // must not resurrect the pre-move order.
    setEditingSong((prev) => {
      const newCues = [...(prev.cues || [])];
      if (target < 0 || target >= newCues.length) return prev;
      const tmp = newCues[idx];
      newCues[idx] = newCues[target];
      newCues[target] = tmp;
      return { ...prev, cues: newCues };
    });
  };

  const duplicateCue = (idx) => {
    if (idx == null || idx < 0) return;
    setEditingSong((prev) => {
      const newCues = [...(prev.cues || [])];
      if (!newCues[idx]) return prev;
      const copy = { ...newCues[idx] };
      delete copy.id;
      newCues.splice(idx + 1, 0, copy);
      return { ...prev, cues: newCues };
    });
  };

  const setCueBackground = (idx, bgType, bgValue) => {
    if (idx === -1) { updateCue(-1, { bg_type: bgType, bg_value: bgValue }); return; }
    setEditingSong((prev) => {
      const newCues = [...(prev.cues || [])];
      if (!newCues[idx]) return prev;
      newCues[idx] = { ...newCues[idx], bg_type: bgType, bg_value: bgValue };
      return { ...prev, cues: newCues };
    });
  };

  const cueFileToBackground = async (idx, type, file) => {
    if (file) {
      const url = await persistMediaFile(file);
      setCueBackground(idx, type, url || URL.createObjectURL(file));
    }
  };

  const setSongBackground = (bgType, bgValue) => setEditingSong((prev) => ({ ...prev, bg_type: bgType, bg_value: bgValue }));

  const songBgFileToBackground = async (type, file) => {
    if (file) {
      const url = await persistMediaFile(file);
      setSongBackground(type, url || URL.createObjectURL(file));
    }
  };

  const clearCueBackground = (idx) => setCueBackground(idx, 'color', '#000000');

  // ---------------------------------------------------------------------
  // RE-SPLIT — the editor header's Split button. It splits AND merges.
  //
  // It used to only ever CUT, so it could never undo itself: paste at 1
  // line/block, set 4, press Split, nothing happened (every cue already held
  // ≤4 lines). The count was a one-way door.
  //
  // The whole rule lives in lib/splitReflow.js — every section is rebuilt
  // from ALL of its "(Part n)" slides together and re-chunked through the
  // parser's own splitter, so an editor Split is line-for-line what Smart
  // Paste would produce at that number. fitParsedCue is passed in so that
  // module stays free of the lyrics renderer (and testable on its own).
  // ---------------------------------------------------------------------
  // Live: the header's number re-flows the blocks the moment it changes, so
  // the operator sees the result as they type (the pure pass is sub-ms; the
  // slide strip redraws). An override is taken so the caller can pass the
  // value it just set — setState alone would still be stale in this closure.
  // Pass nothing to use the current linesPerSlide (the Split button does).
  const splitCuesToLines = (nOverride) => {
    const n = Math.max(1, Math.floor(Number(nOverride ?? linesPerSlide) || 4));
    // Functional: the source cues are read at commit time, so a keystroke
    // still sitting in the canvas throttle can't be lost — or half-applied.
    setEditingSong((prev) => ({ ...prev, cues: reflowCuesToLines(prev?.cues, n, fitParsedCue) }));
  };

  // ---- G-PRESENTER STYLE EDITOR HELPERS ----
  const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480 };
  const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const defaultTitleCue = {
    id: 'title-card',
    label: 'Song Title',
    text: editingSong?.title || '',
    box: { x: 80, y: 140, w: 1120, h: 440 },
    size: DEFAULT_LYRIC_SIZE,
    align: 'center',
    color: '#ffffff'
  };
  const editorCue = editorCueIdx === -1
    ? (editingSong.title_cue || defaultTitleCue)
    : ((editingSong.cues || [])[editorCueIdx] || null);
  const editorBox = editorCue?.box || DEFAULT_BOX;

  const updateCue = (idx, patch) => {
    if (idx == null) { console.warn('[KOG] updateCue DROPPED — no cue index:', patch && Object.keys(patch)); return; }
    if (idx === -1) {
      setEditingSong(prev => {
        const cur = prev.title_cue || { ...defaultTitleCue, text: prev.title || defaultTitleCue.text };
        return { ...prev, title_cue: { ...cur, ...patch } };
      });
      return;
    }
    setEditingSong(prev => {
      const newCues = [...(prev.cues || [])];
      if (!newCues[idx]) return prev;
      newCues[idx] = { ...newCues[idx], ...patch };
      return { ...prev, cues: newCues };
    });
  };

  // Slider drags fire an input event per mousemove; each used to round-trip
  // setEditingSong → full-app re-render (plain-object context), re-rendering
  // the whole song grid at drag rate. Leading edge keeps the canvas preview
  // instant; the trailing edge lands the final value 120ms after movement stops.
  const cueThrottleRef = useRef({ timer: null, idx: null, objIdx: null, patch: null });
  // objIdx null = the slide's MAIN text (the cue's own fields); otherwise the
  // patch targets an extra text box at that index on that slide. One queue, so
  // a slider drag on a box and a slider drag on the slide never interleave.
  const runThrottledPatch = (idx, objIdx, patch) => {
    if (idx == null) return;
    if (objIdx != null) updateTextObject(idx, objIdx, patch);
    else updateCue(idx, patch);
  };
  const updateCueThrottled = (idx, patch) => {
    const q = cueThrottleRef.current;
    q.idx = idx; q.objIdx = null; q.patch = patch;
    if (q.timer) return;
    runThrottledPatch(idx, null, patch);
    q.timer = setTimeout(() => { q.timer = null; if (q.idx != null) runThrottledPatch(q.idx, q.objIdx, q.patch); }, 120);
  };
  const updateTextObjectThrottled = (idx, objIdx, patch) => {
    const q = cueThrottleRef.current;
    q.idx = idx; q.objIdx = objIdx == null ? null : Number(objIdx); q.patch = patch;
    if (q.timer) return;
    runThrottledPatch(idx, q.objIdx, patch);
    q.timer = setTimeout(() => { q.timer = null; if (q.idx != null) runThrottledPatch(q.idx, q.objIdx, q.patch); }, 120);
  };
  // Drain a pending trailing write WITHOUT waiting 120ms. Returns the patch
  // so the caller can merge it into a snapshot itself — setState is async, so
  // merely calling updateCue() here would still save the pre-drag value.
  const flushCueThrottle = () => {
    const q = cueThrottleRef.current;
    if (q.timer) { clearTimeout(q.timer); q.timer = null; }
    const out = (q.idx != null && q.patch) ? { idx: q.idx, objIdx: q.objIdx, patch: q.patch } : null;
    q.idx = null; q.objIdx = null; q.patch = null;
    return out;
  };
  const applyPatchToSnapshot = (song, idx, patch, objIdx = null) => {
    if (idx === -1) {
      const cur = song.title_cue || { ...defaultTitleCue, text: song.title || defaultTitleCue.text };
      return { ...song, title_cue: { ...cur, ...patch } };
    }
    const newCues = [...(song.cues || [])];
    if (!newCues[idx]) return song;
    newCues[idx] = patchTextObject(newCues[idx], objIdx == null ? 0 : objIdx, patch);
    return { ...song, cues: newCues };
  };

  // --- extra text boxes on a lyric slide ---------------------------------
  // Object index 0 is the slide's main text (the cue's own fields); 1..n are
  // the boxes in cue.texts[]. Both writers go through the same history-friendly
  // setEditingSong path as updateCue, so an undo covers them too.
  const updateTextObject = (idx, objIdx, patch) => {
    if (idx == null || idx < 0 || !patch) return;
    setEditingSong(prev => {
      const cues = [...(prev.cues || [])];
      if (!cues[idx]) return prev;
      const next = patchTextObject(cues[idx], objIdx, patch);
      if (next === cues[idx]) return prev;
      cues[idx] = next;
      return { ...prev, cues };
    });
  };
  const moveTextObjectInCue = (idx, objIdx, dir) => {
    if (idx == null || idx < 0) return;
    setEditingSong(prev => {
      const cues = [...(prev.cues || [])];
      if (!cues[idx]) return prev;
      const next = moveTextObject(cues[idx], objIdx, dir);
      if (next === cues[idx]) return prev;
      cues[idx] = next;
      return { ...prev, cues };
    });
  };
  // Add / delete / duplicate a box — all FUNCTIONAL updaters, so a pending
  // typed-text flush queued a tick earlier lands first and can never be
  // overwritten by a stale `editingSong` snapshot.
  const mutateTextObjects = (idx, fn) => {
    if (idx == null || idx < 0) return;
    setEditingSong(prev => {
      const cues = [...(prev.cues || [])];
      if (!cues[idx]) return prev;
      const next = fn(cues[idx]);
      if (next === cues[idx]) return prev;
      cues[idx] = next;
      return { ...prev, cues };
    });
  };
  const addTextObjectToCue = (idx, obj) => { if (obj) mutateTextObjects(idx, (cue) => addTextObject(cue, obj)); };
  const removeTextObjectFromCue = (idx, objIdx) => mutateTextObjects(idx, (cue) => removeTextObject(cue, objIdx));
  const duplicateTextObjectInCue = (idx, objIdx) => mutateTextObjects(idx, (cue) => duplicateTextObject(cue, objIdx));

  // One click: merge a patch into every slide (title slide included).
  const applyPatchToAllCues = (patch) => {
    if (!patch) return;
    // The patch usually carries a new size — refit every box to its own text
    // at that size, so applying a bigger/smaller font never leaves a slide
    // whose text no longer fits its box. The fitter measures with each merged
    // cue's OWN face/tracking (and its own size when the patch carries none),
    // so the box matches what actually renders. Fill-mode cues are exempt:
    // their box SETS the size, so moving it would change what fill computes.
    const stOf = (n) => ({
      font: n.font,
      size: n.size,
      lineHeight: n.lineHeight,
      caseMode: n.case,
      pad: n.pad,
      bold: n.bold,
      italic: n.italic,
      letterSpacing: n.letterSpacing,
      highlight: n.highlight,
      fill: n.resizeMode === 'fill',
    });
    const refit = (next, prevCue) => (prevCue.resizeMode === 'fill'
      ? next
      : { ...next, box: fitBoxToText(next.text || '', stOf(next), prevCue.box) });
    setEditingSong(prev => ({
      ...prev,
      title_cue: (() => {
        const base = prev.title_cue || { ...defaultTitleCue, text: prev.title || defaultTitleCue.text };
        return refit({ ...base, ...patch }, base);
      })(),
      cues: (prev.cues || []).map(c => refit({ ...c, ...patch }, c)),
    }));
  };

  // Group key for the slide filmstrip: "(Part N)" is a chunk of a section, not a
  // section. The trailing-letter strip is for "Section A/B" / "Verse 1a" style
  // markers, so it only eats a letter that follows a space or a digit. The old
  // bare /[a-z]$/i ate the last letter of every plain label instead — "Chorus"
  // became "Choru", "Bridge" became "Bridg" — and that is what the group header
  // printed.
  const baseGroupLabel = (label = '') => label.replace(/\s*\(Part\s+\d+\)\s*$/i, '').replace(/(?<=[\s0-9])[A-Za-z]$/, '').trim() || 'Slides';

  const nextSuffixLetter = (labels, base) => {
    const used = labels.filter(l => l.startsWith(base)).map(l => l.slice(base.length).toLowerCase()).filter(x => /^[a-z]$/.test(x));
    let code = 98; // 'b'
    while (used.includes(String.fromCharCode(code))) code++;
    return String.fromCharCode(code);
  };

  const splitCueAtTextareaCaret = (ta) => {
    if (!ta || editorCueIdx < 0) return;
    const pos = ta.selectionStart || 0;
    const before = ta.value.slice(0, pos).trimEnd();
    const after = ta.value.slice(pos).trimStart();
    if (!after) return;
    // Text AND index both resolve at commit time: a reorder between opening
    // the split prompt and confirming it splits the right slide.
    const liveText = ta.value;
    setEditingSong((prev) => {
      const cues = prev.cues || [];
      const cur = cues[editorCueIdx] || {};
      const labels = cues.map(c => c.label);
      const base = baseGroupLabel(cur.label);
      const letter = nextSuffixLetter(labels, base);
      const newCues = [...cues];
      newCues[editorCueIdx] = { ...cur, text: liveText.slice(0, pos).trimEnd() };
      newCues.splice(editorCueIdx + 1, 0, { ...cur, label: `${base}${letter}`, text: liveText.slice(pos).trimStart(), id: undefined, locked: false, box: cur.box || DEFAULT_BOX });
      return { ...prev, cues: newCues };
    });
    setEditorCueIdx(editorCueIdx + 1);
    setTimeout(() => setCanvasEdit(true), 0);
  };

  const reorderCues = (from, to) => {
    if (from == null || to == null || from === to) return;
    setEditingSong((prev) => {
      const arr = [...(prev.cues || [])];
      if (from < 0 || from >= arr.length || to < 0 || to > arr.length) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...prev, cues: arr };
    });
    setEditorCueIdx(to);
  };

  const startBoxDrag = (e, mode) => {
    if (!editorCue || editorCue.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setBoxDrag({ mode, sx: e.clientX, sy: e.clientY, box: { ...(editorCue.box || DEFAULT_BOX) } });
  };

  const onStagePointerMove = (e) => {
    if (!boxDrag || !editorCue) return;
    const dx = (e.clientX - boxDrag.sx) / canvasScale;
    const dy = (e.clientY - boxDrag.sy) / canvasScale;
    const b = boxDrag.box;
    let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
    if (boxDrag.mode === 'move') {
      nx = clampNum(b.x + dx, 0, 1280 - b.w);
      ny = clampNum(b.y + dy, 0, 720 - b.h);
    } else {
      if (boxDrag.mode.includes('w')) { nx = clampNum(b.x + dx, 0, b.x + b.w - 60); nw = b.x + b.w - nx; }
      if (boxDrag.mode.includes('e')) { nw = clampNum(b.w + dx, 60, 1280 - b.x); }
      if (boxDrag.mode.includes('n')) { ny = clampNum(b.y + dy, 0, b.y + b.h - 60); nh = b.y + b.h - ny; }
      if (boxDrag.mode.includes('s')) { nh = clampNum(b.h + dy, 60, 720 - b.y); }
    }
    const patch = { box: { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) } };
    if (boxDrag.mode !== 'move') {
      const origH = b.h || 480;
      const origSize = Number(editorCue.size) || DEFAULT_LYRIC_SIZE;
      const ratio = origSize / origH;
      patch.size = Math.round(clampNum(nh * ratio, 18, FONT_SIZE_MAX));
    }
    updateCue(editorCueIdx, patch);
  };

  const endBoxDrag = () => setBoxDrag(null);

  // `disabled` uses aria-disabled rather than the attribute: a truly disabled
  // button swallows hover in Chromium, so its tooltip — which is the only
  // explanation of WHY it is grey — would never show.
  const ToolbarBtn = ({ children, danger, active, disabled, title, onClick }) => (
    <button title={title} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: active ? 'rgba(54,201,130,0.15)' : C.elevated, border: '1px solid ' + (active ? 'rgba(54,201,130,0.5)' : 'var(--ui-border2)'), color: danger ? '#FF4545' : C.text2, borderRadius: 7, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>{children}</button>
  );

  // cueLyricStyle lives in lib/lyrics — shared with the editor's slide strip
  // and the slide grid so every surface renders a cue identically.

  useEffect(() => {
    if (!isEditorOpen) { setCanvasEdit(false); setBoxDrag(null); return; }
    fetchMediaLibrary();
    const n = (editingSong.cues || []).length;
    setEditorCueIdx(i => Math.min(i, Math.max(0, n - 1)));
    setCanvasEdit(!editingSong.id);
  }, [isEditorOpen, editingSong.id]);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const update = () => setCanvasScale(el.clientWidth / 1280);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editorMode, isEditorOpen]);

  const handleSaveSong = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      // A slider released <120ms ago still has its final value sitting in the
      // throttle — merge it into the snapshot or the DB keeps the pre-drag one.
      const pending = flushCueThrottle();
      const wasNew = editingSong.id == null;
      const snap = normalizeSongGeometry(pending ? applyPatchToSnapshot(editingSong, pending.idx, pending.patch, pending.objIdx) : editingSong);
      if (pending) runThrottledPatch(pending.idx, pending.objIdx, pending.patch);
      const editor = useSongEditorStore.getState();
      editor.markSaving();
      let savedId;
      try {
        savedId = await ipcRenderer.invoke('db-save-song', snap);
      } catch (err) {
        editor.markSaveError();
        toast.add({ type: 'error', title: 'Save failed', description: err?.message || 'The song could not be saved.' });
        return;
      }
      editor.markSaved(snap);
      fetchSongs();
      // The work is safe now — drop the recovery copy so the next open of this
      // song starts clean instead of offering back what was just written.
      clearSongDraft();
      if (wasNew && savedId) {
        // New-song smart-paste flow: saving lands straight into the editor on
        // the manual canvas (full details reloaded so boxes/styles are exact),
        // instead of closing back to the library.
        const details = await ipcRenderer.invoke('db-get-song-details', savedId);
        if (details) {
          const rep = repairSongBoxes(details);
          // New id = new document: history restarts, baseline is the saved copy.
          editor.loadDocument(rep, { baseline: rep, editorCueIdx: -1 });
          // The save landed and the editor STAYS open: this reloaded copy is
          // the new clean baseline, so everything typed from here counts as
          // new work rather than unsaved work.
          songSnapRef.current = songSnapOf(rep);
          setEditorMode('manual');
          return;
        }
      }
      setIsEditorOpen(false);
      if (editingSong.id) selectSong(editingSong.id);
    }
  };

  const handleDeleteSong = async (id) => {
    if (!window.require) return;
    if (!(await appConfirm('Are you sure you want to delete this song?', { confirmLabel: 'Delete' }))) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-song', id);
    fetchSongs();
  };

  const handleToggleFavorite = async (id, e) => {
    e.stopPropagation();
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-toggle-favorite', id);
      fetchSongs();
      if (activeSong?.id === id) selectSong(id);
    }
  };

  const handleExport = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-export');
    }
  };

  const handleImport = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const success = await ipcRenderer.invoke('db-import');
      if (success) fetchSongs();
    }
  };

  // ---- COMMAND CENTER LAYOUT HELPERS ----
  const {
    ACCENT,
    ACCENT_SOFT,
    ACCENT_SOFT_2,
    C,
    PINK,
    ACCENT_PINK,
    PINK_SOFT,
    PINK_SOFT_2,
    NEBULA,
    PINK2,
    ACCENCY,
  } = getTheme(themeDark);

  const serviceSections = () => {
    const items = activeService?.items || [];
    const sections = [];
    let current = null;
    items.forEach(item => {
      if (item.item_type === 'section_header') {
        current = { title: item.title, subtitle: item.subtitle || 'Section Flow', items: [] };
        sections.push(current);
      } else {
        if (!current) { current = { title: 'General', subtitle: 'Section Flow', items: [] }; sections.push(current); }
        current.items.push(item);
      }
    });
    return sections;
  };

  // --- LAN REMOTE BRIDGE ---------------------------------------------------
  // A phone is a *remote*, not a second brain: it never mutates output state.
  // Commands arrive on `mobile-command` (main.js just forwards them) and land
  // in the exact same handlers the desktop buttons call, then the desktop
  // pushes a fresh snapshot — so both screens always agree.
  //
  // Re-pointed after every commit so the once-registered listener never holds
  // a stale closure.
  // ---- REMOTE BIBLE (LAN phone panel) --------------------------------------
  // Same installed-translation IPCs the desktop Scripture tab uses, repackaged
  // for the phone: every answer lands in bibleRemote and rides the next
  // snapshot down, so the WS protocol never changes. Phones read + fire only
  // (no downloads, no deletes — those stay desktop-side).
  const remoteBibleIpc = () => (window.require ? window.require('electron').ipcRenderer : null);
  const remoteBibleAbbrev = (want) => {
    const w = String(want || '').trim();
    if (w) return w;
    if (bibleRemote && bibleRemote.abbrev) return bibleRemote.abbrev;
    return bibleTrans || 'kjv';
  };
  const remoteBibleCatalog = async () => {
    const ipc = remoteBibleIpc();
    if (!ipc) return;
    try {
      const lib = await ipc.invoke('scripture-list-bibles');
      const catalog = (Array.isArray(lib) ? lib : []).filter((b) => b && b.installed)
        .map((b) => ({ abbrev: b.abbrev, name: b.name, code: b.code || b.abbrev, books: b.books || 0 }));
      touchBibleRemote({
        catalog,
        abbrev: remoteBibleAbbrev(catalog[0] && catalog[0].abbrev),
        error: catalog.length ? null : 'No Bibles installed — download one on the computer first.',
      });
    } catch (e) { touchBibleRemote({ error: 'Could not list Bibles.' }); }
  };
  const remoteBibleBooks = async (want) => {
    const ipc = remoteBibleIpc();
    if (!ipc) return;
    const abbrev = remoteBibleAbbrev(want);
    try {
      const res = await ipc.invoke('scripture-books', abbrev);
      if (res && res.error) { touchBibleRemote({ abbrev, error: res.error }); return; }
      touchBibleRemote({ abbrev, books: res.books || [], translation: res.translation || '', error: null });
    } catch (e) { touchBibleRemote({ abbrev, error: 'Could not read books.' }); }
  };
  const remoteBibleChapter = async (wantAbbrev, book, chapter) => {
    const ipc = remoteBibleIpc();
    if (!ipc) return;
    const abbrev = remoteBibleAbbrev(wantAbbrev);
    const b = Math.max(1, Math.floor(Number(book) || 1));
    const c = Math.max(1, Math.floor(Number(chapter) || 1));
    try {
      const res = await ipc.invoke('scripture-chapter', abbrev, b, c);
      if (res && res.error) { touchBibleRemote({ abbrev, error: res.error }); return; }
      touchBibleRemote({
        abbrev,
        passage: { book: res.book, bookIndex: res.bookIndex, chapter: res.chapter, verses: res.verses || [], prev: res.prev ?? null, next: res.next ?? null, totalChapters: res.totalChapters || 0, select: [] },
        results: null,
        error: null,
      });
    } catch (e) { touchBibleRemote({ abbrev, error: 'Could not read chapter.' }); }
  };
  const remoteBibleSearch = async (wantAbbrev, q) => {
    const ipc = remoteBibleIpc();
    if (!ipc) return;
    const abbrev = remoteBibleAbbrev(wantAbbrev);
    const query = String(q || '').trim().slice(0, 80);
    if (query.length < 2) { touchBibleRemote({ abbrev, results: [], error: null }); return; }
    try {
      const res = await ipc.invoke('scripture-search', abbrev, query, 40);
      if (res && res.error) { touchBibleRemote({ abbrev, error: res.error }); return; }
      touchBibleRemote({ abbrev, results: (res && res.results) || [], passage: null, error: null });
    } catch (e) { touchBibleRemote({ abbrev, error: 'Search failed.' }); }
  };
  // "John 3:16" → resolve + chapter in one hop; the resolved verse (if any)
  // is pre-selected so Fire sends exactly it.
  const remoteBibleGo = async (wantAbbrev, ref) => {
    const ipc = remoteBibleIpc();
    if (!ipc) return;
    const abbrev = remoteBibleAbbrev(wantAbbrev);
    const reference = String(ref || '').trim().slice(0, 80);
    if (!reference) return;
    try {
      const r = await ipc.invoke('scripture-resolve', abbrev, reference);
      if ((r && r.error) || !r || !r.bookIndex) {
        // Not a reference — fall back to keyword search like the desktop.
        await remoteBibleSearch(abbrev, reference);
        return;
      }
      const ch = await ipc.invoke('scripture-chapter', abbrev, r.bookIndex, r.chapter || 1);
      if ((ch && ch.error) || !ch) { touchBibleRemote({ abbrev, error: (ch && ch.error) || 'Could not read chapter.' }); return; }
      touchBibleRemote({
        abbrev,
        passage: { book: ch.book, bookIndex: ch.bookIndex, chapter: ch.chapter, verses: ch.verses || [], prev: ch.prev ?? null, next: ch.next ?? null, totalChapters: ch.totalChapters || 0, select: r.verse ? [Number(r.verse)] : [] },
        results: null,
        error: null,
      });
    } catch (e) { touchBibleRemote({ abbrev, error: 'Lookup failed.' }); }
  };
  // Fire selected verses (or the resolved one) to the live output through the
  // same builder the desktop uses — translation override keeps the desktop's
  // own translation picker untouched.
  const remoteBibleFire = (p) => {
    try {
      if (!p || typeof p !== 'object') return false;
      const abbrev = remoteBibleAbbrev(p.abbrev);
      const book = String(p.book || '').trim().slice(0, 60);
      const chapter = Math.max(1, Math.floor(Number(p.chapter) || 1));
      const verses = (Array.isArray(p.verses) ? p.verses : []).slice(0, 30)
        .map((v) => ({ verse: Math.max(1, Math.floor(Number(v && v.verse) || 1)), text: String((v && v.text) || '').slice(0, 2000) }))
        .filter((v) => v.text.trim());
      if (!book || !verses.length) return false;
      fireServiceItemLive(buildBiblePayload({ book, chapter, verses }, null, bibleFmt, abbrev));
      return true;
    } catch { return false; }
  };
  useEffect(() => {
    mobileCmdsRef.current = {
      next: () => handleNextCue(),
      prev: () => handlePrevCue(),
      clearLyrics: () => clearLyrics(),
      clearAll: () => fireCueLive({ id: 'clear', label: 'Clear', text: '' }),
      // "It went black, put it back" — re-fires whatever is already on air.
      // Keep the exact arrangement step so a repeated section stays put.
      reassert: () => { if (activeCue && activeCue.id !== 'clear') fireCueLive(activeCue, null, arrangeRef.current?.index ?? undefined); },
      cue: ({ id }) => {
        const cue = (activeSong?.cues || []).find(x => x.id === id);
        if (!cue) return false;
        fireCueLive(cue);
        return true;
      },
      serviceGo: ({ id }) => {
        const item = (activeService?.items || []).find(i => i.id === id);
        if (!item) return false;
        fireServiceItemLive(item);
        return true;
      },
      serviceStop: ({ id }) => {
        const item = (activeService?.items || []).find(i => i.id === id);
        if (!item) return false;
        stopServiceItemLive(item);
        return true;
      },
      // Full countdown control from the phone: same handlers as the dock tab.
      countdownGo: () => { fireCountdownLive(); return true; },
      countdownStop: () => { stopCountdownLive(); return true; },
      // Audience message overlay from the phone: text-only (uploads stay
      // desktop-side — they need the file dialog). Sanitized like
      // countdownSet: whitelisted style, clamped timeout, capped text.
      overlayShow: (p) => {
        if (!p || typeof p !== 'object') return false;
        const text = String(p.text || '').slice(0, 140).trim();
        if (!text) return false;
        const style = p.style === 'center' || p.style === 'banner' ? p.style : 'lower';
        fireOverlay(text, { style, secs: Math.max(0, Math.min(3600, Math.floor(Number(p.secs) || 0))) });
        return true;
      },
      overlayClear: () => { clearOverlay(); return true; },
      clearWorkspace: () => { clearWorkspace(); return true; },
      // PowerPoint sermon control from the phone (loading a file stays
      // desktop-only — it needs the file dialog).
      sermonLayer: ({ layer }) => { sermonSetLayer(layer === 'passthrough' ? 'passthrough' : 'kog'); return true; },
      sermonNext: () => { sermonNav(1); return true; },
      sermonPrev: () => { sermonNav(-1); return true; },
      sermonGoto: ({ index }) => { sermonGoto(index); return true; },
      sermonClose: () => { sermonClose(); return true; },
      countdownSet: (patch) => {
        if (!patch || typeof patch !== 'object') return false;
        const clean = {};
        for (const k of ['title', 'subtext', 'mode', 'durationSec', 'targetTime', 'showOn', 'overtime', 'titleSize', 'timeSize', 'subtextSize', 'bgType', 'bgValue', 'bgMedia']) {
          if (patch[k] !== undefined) clean[k] = patch[k];
        }
        // `live` never travels in: timing stays owned by Go/Stop.
        if (clean.mode && !['duration', 'target', 'clock'].includes(clean.mode)) delete clean.mode;
        if (clean.showOn && !['both', 'main', 'stage'].includes(clean.showOn)) delete clean.showOn;
        if (clean.bgType && !['color', 'gradient', 'animated', 'media'].includes(clean.bgType)) delete clean.bgType;
        // Media from a paired phone is apply-only: shape-checked, URLs pass
        // through untouched (they already resolve on every surface).
        if (clean.bgMedia !== undefined && (typeof clean.bgMedia !== 'object' || !clean.bgMedia)) delete clean.bgMedia;
        if (clean.durationSec !== undefined) clean.durationSec = Math.max(0, Math.floor(Number(clean.durationSec) || 0));
        setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), ...clean }));
        return true;
      },
      // Remote Bible panel: browse + search installed translations, fire
      // passages. Answers land in bibleRemote and ride the next snapshot.
      bibleCatalog: () => { void remoteBibleCatalog(); return true; },
      bibleBooks: (p) => { void remoteBibleBooks(p && p.abbrev); return true; },
      bibleChapter: (p) => { void remoteBibleChapter(p && p.abbrev, p && p.book, p && p.chapter); return true; },
      bibleSearch: (p) => { void remoteBibleSearch(p && p.abbrev, p && p.q); return true; },
      bibleGo: (p) => { void remoteBibleGo(p && p.abbrev, p && p.ref); return true; },
      bibleFire: (p) => remoteBibleFire(p || {}),
      // Remote draw mode: phone highlighter strokes over the live output.
      // Both entries below just delegate — the desk-top telestrator calls the
      // very same two functions, so there is one implementation to get right.
      drawAdd: (p) => addDrawStroke(p && p.stroke),
      drawUndo: () => { undoDrawStroke(); return true; },
      drawClear: () => { clearDrawStrokes(); return true; },
      // DRUMMER METRONOME CONTROL: the drummer's stage phone owns tempo + song
      // pick. Everything lands on the SAME stageCfg/tempo panel the desktop
      // edits, so the room (stage beat-dot, desktop panel, every other phone)
      // converges on the drummer's numbers — no private tempo anywhere.
      //   · songId → the console's loaded song + tempo panel follow the pick
      //     (selectSong never touches the output, so projection is untouched)
      //   · bpm / timeSignature → the shared metronome config moves.
      metronomeSet: (p) => {
        if (!p || typeof p !== 'object') return false;
        const rawId = p.songId == null ? '' : String(p.songId).trim();
        const wantBpm = Math.round(Number(p.bpm));
        const hasBpm = Number.isFinite(wantBpm) && wantBpm >= MIN_BPM && wantBpm <= MAX_BPM;
        const wantMeter = Math.round(Number(p.timeSignature));
        const hasMeter = Number.isFinite(wantMeter) && wantMeter >= 1 && wantMeter <= 12;
        if (!rawId && !hasBpm && !hasMeter) return false;
        if (rawId) {
          const asNum = Number(rawId);
          selectSong(Number.isFinite(asNum) ? asNum : rawId);
          // The tempo panel follows immediately (id-keyed effect below only
          // re-fires on an actual song CHANGE, so set it here too).
          const rec = (songs || []).find((s) => String(s.id) === rawId);
          setStageBpmPopup({ songId: rawId, title: String(p.title || (rec && rec.title) || 'Song').slice(0, 120) });
        }
        if (hasBpm || hasMeter) {
          setStageCfg((prev) => {
            const next = { ...prev, metronome: true };
            if (hasBpm) next.bpm = wantBpm;
            if (hasMeter) next.timeSignature = wantMeter;
            return next.bpm === prev.bpm && next.timeSignature === prev.timeSignature && next.metronome === prev.metronome
              ? prev
              : next;
          });
        }
        return true;
      },
    };
  });

  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onCommand = (event, msg) => {
      if (!msg || !msg.cmd) return;
      const fn = mobileCmdsRef.current[msg.cmd];
      if (typeof fn !== 'function') return;
      try { fn(msg.payload || {}); } catch (e) { console.warn('[remote] command failed:', msg.cmd, e); }
    };
    ipcRenderer.on('mobile-command', onCommand);
    return () => ipcRenderer.removeListener('mobile-command', onCommand);
  }, [isOutputWindow]);

  // Publish what phones render. Sent only when a control-relevant value
  // changes; main.js stores the last one and hands it to any socket that
  // connects later, which is what removes the load-order race.
  const pushMobileState = () => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const live = liveOutputPayload();
    const liveId = liveServiceItem ? liveServiceItem.id : null;
    const snap = {
      v: 1,
      at: Date.now(),
      themeDark: !!themeDark,
      // Visual metronome settings. Drummer phones own their transport; this
      // block only tells them WHAT to play (tempo + meter), never whether the
      // pulse is running.
      metronome: {
        bpm: clampBpm(stageCfg?.bpm),
        timeSignature: normalizeTimeSignature(stageCfg?.timeSignature),
      },
      live: live ? {
        title: live.title || '',
        label: live.label || '',
        // A photo/video slide is not a song: drummer phones use this flag so a
        // media file can never be mistaken for the loaded lyric song.
        media: live.media === true,
        text: live.text || '',
        timestamp: live.timestamp || 0,
        presentation: live.presentation || null,
        meta: live.meta || null,
        // Full slide look for the phone's true miniature preview (lyric
        // style + box + background + timer). Small object, pushed on change.
        style: live.style || null,
        timer: live.timer || null,
      } : null,
      // Audience message overlay state, so the control phone can show LIVE
      // and offer Clear without a second channel (media bug rides along as
      // a flag — phones stay text-only by scope).
      overlay: overlayOnAir(liveOverlay)
        ? { text: liveOverlay.text || '', style: liveOverlay.style || 'lower', until: liveOverlay.until || 0, stamp: liveOverlay.stamp || 0, media: !!(liveOverlay.media && liveOverlay.media.url) }
        : null,
      stage: stageSnapshotRef.current
        // Full stage feed for the singer view: payload + config + flow +
        // chords, so a phone mirrors the monitor (clock, alert, tracker,
        // contrast) without a second channel.
        ? {
          ...stageSnapshotRef.current,
          cfg: stageCfg,
          flow: stageFlow,
          chord: activeSong ? { text: activeSong.chord_chart || '', key: activeSong.chord_key || 'C' } : null,
        }
        : null,
      song: activeSong ? {
        id: activeSong.id,
        title: activeSong.title || '',
        artist: activeSong.artist || '',
        cues: (activeSong.cues || []).map(c => ({ id: c.id, label: c.label || '', text: c.text || '' })),
      } : null,
      activeCueId: activeCue ? activeCue.id : null,
      liveItemId: liveId,
      service: (() => {
        // Song rows carry their id + saved tempo so a phone (the drummer's
        // set-list picker) can offer every song in the order WITH its BPM
        // without a second channel. Medleys resolve to their anchor song.
        const songMeta = new Map();
        for (const s of songs || []) if (s && s.id != null) songMeta.set(String(s.id), s);
        const songRefOf = (it) => {
          let sid = null;
          if (it.item_type === 'song') sid = String(it.content ?? '').trim();
          else if (it.item_type === 'medley') {
            const def = parseMedleyDef(it);
            if (def && def.anchor && def.anchor.songId != null) sid = String(def.anchor.songId);
          }
          return sid || null;
        };
        return {
          name: activeService?.name || activeService?.title || '',
          sections: serviceSections().map(s => ({
            title: s.title,
            items: s.items.map(i => {
              const songId = songRefOf(i);
              const rec = songId ? songMeta.get(songId) : null;
              const saved = rec ? Math.round(Number(rec.bpm)) : 0;
              return {
                id: i.id,
                item_type: i.item_type,
                title: i.title || '',
                subtitle: i.subtitle || '',
                bible: !!(i.meta && i.meta.kind === 'bible'),
                live: i.id != null && i.id === liveId,
                songId,
                bpm: saved >= MIN_BPM && saved <= MAX_BPM ? saved : null,
              };
            }),
          })),
        };
      })(),
      timer: {
        start: slideTimer?.start ?? null,
        elapsed: slideTimer?.elapsed ?? 0,
        duration: slideTimer?.duration ?? 0,
      },
      sermon: sermon ? {
        loaded: !!sermon.loaded,
        title: sermon.title || '',
        total: Number(sermon.total) || 0,
        index: Number(sermon.index) || 0,
        passthrough: !!sermon.passthrough,
        displayLabel: sermon.displayLabel || '',
        provider: sermon.provider || '',
      } : null,
      countdown: countdown ? {
        title: countdown.title || '',
        subtext: countdown.subtext || '',
        mode: countdown.mode || 'duration',
        durationSec: Number(countdown.durationSec) || 0,
        targetTime: countdown.targetTime || '',
        showOn: countdown.showOn || 'both',
        overtime: !!countdown.overtime,
        titleSize: Number(countdown.titleSize) || 64,
        timeSize: Number(countdown.timeSize) || 360,
        subtextSize: Number(countdown.subtextSize) || 40,
        bgType: countdown.bgType || 'gradient',
        bgValue: countdown.bgValue || '',
        bgMedia: countdown.bgMedia || null,
        live: countdown.live ? { endsAt: countdown.live.endsAt ?? null, startedAt: countdown.live.startedAt ?? null, pausedAt: countdown.live.pausedAt ?? null, pausedRemain: countdown.live.pausedRemain ?? null } : null,
        // One-click setups for the phone: name + kind + slide count + the
        // full media object apply needs. Small strings; pushed on change.
        templates: (cdTemplates || []).map((t) => ({
          name: t.name || '',
          kind: (t.bgMedia || {}).kind || 'slideshow',
          slides: ((t.bgMedia || {}).images || []).length,
          bgMedia: t.bgMedia || null,
        })),
      } : null,
        // Live-output shape for the phone's Outputs tab: global aspect drives
        // the miniature 1:1 with the desktop preview, and the outputs list
        // mirrors which feeds are up (read-only on the phone).
        outputAspect: outputAspect || '16:9',
        // The wall's real shape, so a Fill output can be mirrored on the
        // phone exactly as the projector fills it.
        wallAspect,
        outputs: (outputs || []).map((o) => ({
          id: o.id,
          name: o.name || '',
          role: o.role || 'lyrics',
          aspect: o.aspect || 'auto',
          resolution: o.resolution || 'native',
          enabled: !!o.enabled,
          bound: o.displayId != null && o.displayId !== '',
        })),
        // Remote draw strokes (capped server-side): the Draw tab echoes them,
        // and a stamp newer than the phone's own means "remote cleared".
        draw: drawStrokes.length ? { strokes: drawStrokes, stamp: drawStampRef.current || 0 } : null,
        // Remote Bible panel answers (null until the phone asks).
        bible: bibleRemote || null,
      };
    ipcRenderer.send('mobile-state', snap);
  };
  pushMobileRef.current = pushMobileState;

  useEffect(() => { pushMobileState(); }, [currentSlide, displays, activeSong, activeCue, activeService, slideTimer, themeDark, targetedDisplays, countdown, sermon, outputAspect, outputs, stageCfg, liveOverlay, drawStrokes, bibleRemote, songs]);

  // Auto-stop: a live non-overtime timer ends itself at zero (blackout +
  // stage clear, same as the Stop button) instead of sitting on 0:00 until
  // someone notices. Wall-clock mode never ends; overtime counts past it.
  useEffect(() => {
    if (isOutputWindow || !window.require) return undefined;
    const live = countdown?.live;
    if (!live || (countdown?.mode !== 'duration' && countdown?.mode !== 'target')) return undefined;
    if (countdown?.overtime || live.endsAt == null) return undefined;
    // Paused: the clock is frozen — no completion can fire. Resume stamps a
    // fresh live object, which re-runs this effect with the new endsAt.
    if (live.pausedAt != null) return undefined;
    const wait = Math.max(0, live.endsAt - Date.now());
    const id = setTimeout(() => {
      // Timer hit zero — stopCountdownLive owns the soundbed fade (single path).
      stopCountdownLive();
    }, wait);
    return () => clearTimeout(id);
  }, [countdown?.live, countdown?.mode, countdown?.overtime]);

  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const onRefresh = () => { if (pushMobileRef.current) pushMobileRef.current(); };
    ipcRenderer.on('mobile-refresh', onRefresh);
    return () => ipcRenderer.removeListener('mobile-refresh', onRefresh);
  }, [isOutputWindow]);

  const resolveBg = (cue, song) => {
    if (cueHasBackground(cue)) return { type: cue.bg_type, value: cue.bg_value };
    if (songHasBackground(song)) return { type: song.bg_type, value: song.bg_value };
    return null;
  };

  const activeSlideIndex = (() => {
    if (activeCue == null || activeCue.id === 'clear') return -1;
    // A live medley counts position in the FLOW, not in one song's grid.
    const med = medleyRef.current;
    if (med && med.slides.length) {
      const at = medleyIndexOfCue(activeCue.id);
      if (at > -1) return at;
    }
    if (activeCue.id === 'title-card') return 0;
    // A live arrangement counts position in the CUSTOM flow too (repeats
    // share one cue id, so repeats read the first occurrence — same as
    // medleys; the Arr. pill is the precise readout).
    const arrCues = arrangementForSong(activeSong);
    if (arrCues) {
      const ai = arrangementIndexOf(arrCues);
      return ai >= 0 ? ai + 1 : -1;
    }
    const idx = (activeSong?.cues || []).findIndex(c => c.id === activeCue.id);
    return idx >= 0 ? idx + 1 : -1;
  })();

  const groupLabels = (() => {
    const seen = [];
    (activeSong?.cues || []).forEach(c => { if (c.label && !seen.includes(c.label)) seen.push(c.label); });
    return seen;
  })();

  // Song-flow tracker for the stage ("Intro › V1 › Chorus …"): part labels
  // with consecutive duplicates collapsed, plus which run is live. Medley
  // sessions read their own slide list (incl. title dividers); everything
  // else reads the arrangement order when one is active, else song order.
  const stageFlow = (() => {
    const med = medleyRef.current;
    let entries = null;
    let arrList = null;
    if (med && med.slides.length) {
      entries = med.slides.map((s) => ({
        label: s.kind === 'title' ? 'Song Title' : (s.cue?.label || 'Slide'),
        id: s.cue ? s.cue.id : medleyTitleId(s.songId),
      }));
    } else if (activeSong && (activeSong.cues || []).length) {
      arrList = arrangementForSong(activeSong);
      const list = arrList || activeSong.cues;
      entries = list.map((c) => ({ label: c.label || 'Slide', id: c.id }));
    }
    if (!entries || !entries.length) return null;
    const runs = [];
    entries.forEach((e, i) => {
      if (runs.length && runs[runs.length - 1].label === e.label) runs[runs.length - 1].to = i;
      else runs.push({ label: e.label, from: i, to: i });
    });
    let index = -1;
    const curId = activeCue && activeCue.id !== 'clear' ? activeCue.id : null;
    if (curId) {
      const a = arrangeRef.current;
      let pos = arrList && a && Number.isInteger(a.index) && arrList[a.index]?.id === a.cueId
        ? a.index
        : -1;
      if (pos < 0) pos = entries.findIndex((e) => e.id === curId);
      if (pos >= 0) index = runs.findIndex((r) => pos >= r.from && pos <= r.to);
    }
    return { labels: runs.map((r) => r.label), index };
  })();

  // Push the stage config feed (cfg + flow + chord chart) to the stage
  // window. main.js caches the last payload and fans it to role=stage
  // windows, and `get-live-state` hands it to a window opened later — so a
  // freshly started stage monitor is already dressed. Console-only push:
  // output windows hold the RECEIVED copy (stageFeed) and never echo it back.
  // Signature-deduped on the flow so cue clicks don't re-send unchanged cfg.
  const stageFlowSig = stageFlow ? `${stageFlow.index}|${stageFlow.labels.join('>')}` : '';
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('update-stage-config', {
      cfg: stageCfg,
      flow: stageFlow,
      chord: activeSong ? { text: activeSong.chord_chart || '', key: activeSong.chord_key || 'C' } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageCfg, stageFlowSig, activeSong?.chord_chart, activeSong?.chord_key, isOutputWindow]);

  const slideGrid = (() => {
    // A live medley shows the WHOLE flow as one grid — anchor title through
    // the last linked stanza — instead of only the current slide's song.
    // Tiles carry their own song (medSong) so faces render per-song.
    const med = medleyRef.current;
    if (med && med.slides.length && activeCue && medleyIndexOfCue(activeCue.id) > -1) {
      const rowTitle = (activeService?.items || []).find(i => i.id === med.itemId)?.title || null;
      return med.slides.map((s, i) => {
        const song = lookupMedleySong(med.songs, s.songId);
        // Song Title Divider support: the grid renders a header above the
        // first tile of each song so the operator sees where flows cross.
        const firstOfSong = i === 0 || String(med.slides[i - 1].songId) !== String(s.songId);
        return s.kind === 'title'
          ? { isTitle: true, medSong: song, medIdx: i, medTitle: rowTitle, medFirstOfSong: firstOfSong }
          : { cue: s.cue, num: i, medSong: song, medIdx: i, medTitle: rowTitle, medFirstOfSong: firstOfSong };
      });
    }
    const tiles = [];
    if (activeSong) tiles.push({ isTitle: true });
    // A live arrangement reorders the GRID into the custom flow (repeats
    // included, keyed by position) — the operator sees and clicks what Go
    // actually walks, exactly like a medley flow. Library order returns the
    // moment the session ends.
    const arrTiles = arrangementForSong(activeSong);
    if (arrTiles) {
      arrTiles.forEach((c, i) => tiles.push({ cue: c, num: i + 1, arrIdx: i }));
      return tiles;
    }
    (activeSong?.cues || []).forEach(c => tiles.push({ cue: c, num: tiles.length }));
    return tiles;
  })();

  // Arrangement live position: which step of the custom order is on air.
  // (Ref read at render, same as medleyRef in slideGrid — every session
  // change re-renders via activeCue/activeSong anyway.)
  const arrangementStatus = (() => {
    const a = arrangeRef.current;
    if (!a || !activeSong || !sameSongId(a.songId, activeSong.id)) return null;
    const ordered = resolvedArrangementCues(activeSong, a.arr);
    if (!ordered.length) return null;
    const at = activeCue ? arrangementIndexOf(ordered) : -1;
    return { pos: at > -1 ? at + 1 : null, total: ordered.length, onTitle: activeCue?.id === 'title-card' };
  })();

  // Tile-face cache: on a cue change only the two tiles whose live ring flips
  // need fresh work — every other tile's face (lyrics + still thumbnail) is
  // identical, so hand back the same element instead of re-running the full
  // cueLyricStyle → renderLyricsLayout measure chain for the whole grid.
  // Same element reference lets React bail out of those subtrees entirely.
  const tileFaceCacheRef = useRef({ song: null, theme: null, nebula: null, map: new Map() });

  // Slide-grid tile face — the Live Output, miniaturized 1:1. `aspect` comes
  // from the output's aspect, and the lyrics run through the SAME
  // cueLyricStyle → renderLyricsLayout chain the projector uses, on a
  // measured 1280×720 canvas (TileCanvas), so position, size, alignment,
  // color, case and shadow are identical to the live output in both themes.
  // Only operator chrome (LIVE pill, #index, section chip) sits on top.
  // Ticker cues render as static lines — a thumbnail must not start a
  // marquee per tile.
  const renderSlideFace = (tile, { height = '150px', aspect, radius = '10px', bg, media, showLiveBadge = true } = {}) => {
    const cue = tile.cue;
    const isTitle = tile.isTitle;
    // Medley tiles bring their own song; plain tiles use the open song.
    const song = tile.medSong || activeSong;
    if (!song) return null;
    // Same title-cue resolution fireTitleLive uses, so the tile shows the
    // exact text/style that would go live.
    const titleCue = song.title_cue || { id: 'title-card', label: 'Song Title', text: song.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: DEFAULT_LYRIC_SIZE, align: 'center', color: '#ffffff' };
    const text = isTitle ? (titleCue.text || song.title || '') : (cue?.text || '');
    const label = isTitle ? 'Title' : (cue?.label || 'Slide');
    const st = { ...cueLyricStyle(isTitle ? titleCue : cue), layoutMode: 'static' };
    st.isTitle = isTitle;
    const box = st.box || { x: 80, y: isTitle ? 140 : 100, w: 1120, h: isTitle ? 440 : 480 };
    const bgInfo = (() => {
      if (isTitle) {
        if (songHasBackground(song)) return { type: song.bg_type, value: song.bg_value };
        return null;
      }
      if (cueHasBackground(cue)) return { type: cue.bg_type, value: cue.bg_value };
      if (songHasBackground(song)) return { type: song.bg_type, value: song.bg_value };
      return null;
    })();
    const faceBg = bg || (bgInfo && (bgInfo.type === 'color' || bgInfo.type === 'gradient') ? bgInfo.value : (bgInfo && bgInfo.type === 'animated' ? animatedPresetOf(bgInfo.value).base : '#000'));
    const mediaLayer = media || (bgInfo && (bgInfo.type === 'image' || bgInfo.type === 'video') ? { type: bgInfo.type, url: bgInfo.value } : null);
    const isAnimatedFace = !!(!media && bgInfo && bgInfo.type === 'animated');
    // Repeated sections share cue ids. When the tile knows its exact flow
    // position (medley/arrangement), only that step lights up — otherwise a
    // repeated chorus would mark every occurrence as live.
    const posLive = tile.medIdx != null
      ? (medleyRef.current ? medleyRef.current.index === tile.medIdx : null)
      : tile.arrIdx != null
        ? (arrangeRef.current ? arrangeRef.current.index === tile.arrIdx : null)
        : null;
    const cueLive = isTitle
      ? (activeCue?.id === 'title-card' || activeCue?.id === medleyTitleId(song.id))
      : !!(cue && activeCue?.id === cue.id);
    const isLive = activeCue != null && activeCue.id !== 'clear' && (posLive == null ? cueLive : (posLive && cueLive));
    const hasMedia = !!mediaLayer;
    // Live tiles always rebuild (LIVE pill timer + pink ring must be fresh).
    // Anything else cached: song/theme/nebula identity invalidates, aspect
    // rides the key, explicit bg/media overrides bypass. The song id rides
    // the key too, so two songs' tiles never share a cache entry.
    const cc = tileFaceCacheRef.current;
    if (cc.song !== activeSong || cc.theme !== C || cc.nebula !== NEBULA) {
      tileFaceCacheRef.current = { song: activeSong, theme: C, nebula: NEBULA, map: new Map() };
    }
    const faceCache = tileFaceCacheRef.current.map;
    // Animated faces never cache (every cache hit would freeze the motion);
    // gradient faces join the key by value so per-cue colors never collide.
    const cacheable = !isLive && !bg && !media && !isAnimatedFace;
    const faceKey = `${aspect || ''}|${song?.id ?? ''}|${isTitle ? 'title' : (cue?.id || ('n' + tile.num))}|${bgInfo ? `${bgInfo.type}:${bgInfo.type === 'animated' ? '' : (bgInfo.value || '')}` : ''}|${JSON.stringify(isTitle ? [titleCue?.card || '', titleCue?.cardEvent || '', titleCue?.cardVenue || ''] : (cue?.texts || []))}`;
    if (cacheable) {
      const hit = faceCache.get(faceKey);
      if (hit) return hit;
    }
    const face = (
      <div style={{ position: 'relative', height: aspect ? 'auto' : height, aspectRatio: aspect, borderRadius: radius, overflow: 'hidden', background: faceBg, border: isLive ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', boxShadow: 'none', boxSizing: 'border-box' }}>
        {mediaLayer && (
          mediaLayer.type === 'image' ? (
            <img key={`bgimg-${mediaLayer.url}`} src={mediaLayer.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
          ) : (
            <TileVideo key={`bgvid-${mediaLayer.url}`} src={mediaLayer.url} animate={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
          )
        )}
        {isAnimatedFace && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            <AnimatedBg value={bgInfo.value} k={0.25} />
          </div>
        )}
        {/* Lyrics exactly as the projector draws them: same renderer, same
            1280×720 canvas, contain-fit to the tile. No darkening overlay or
            bottom gradient — the output has neither. */}
        <TileCanvas>
          {/* Title card framing (rules + artist/event/venue lines) behind the
              title's words — the same component and numbers the wall uses, so
              a console tile is a picture of what will be projected. */}
          {isTitle && st.card ? (
            <TitleCardChrome card={st.card} artist={song?.artist || ''} event={st.cardEvent} venue={st.cardVenue} />
          ) : null}
          {/* Ghost / watermark layer first: part of the slide's composition,
              drawn through the same shared renderer as the main lyric. */}
          {(() => {
            const gh = ghostLayerOf(isTitle ? titleCue : cue);
            if (!gh) return null;
            const gb = gh.lyric.box || { x: 64, y: 170, w: 1152, h: 380 };
            return (
              <div style={{ position: 'absolute', left: gb.x, top: gb.y, width: gb.w, height: gb.h, transform: gb.angle ? `rotate(${gb.angle}deg)` : undefined, transformOrigin: 'center center' }}>
                {renderLyricsLayout(gh.text, { ...gh.lyric, layoutMode: 'static' }, gb)}
              </div>
            );
          })()}
          <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: box.angle ? `rotate(${box.angle}deg)` : undefined, transformOrigin: 'center center' }}>
            {renderLyricsLayout(text, st, box)}
          </div>
          {/* Extra text boxes, drawn exactly like the projector draws them. */}
          {textObjectLayers(isTitle ? titleCue : cue).map((t, i) => {
            const tb = t.lyric.box;
            return (
              <div key={`tx-${i}`} style={{ position: 'absolute', left: tb.x, top: tb.y, width: tb.w, height: tb.h, transform: tb.angle ? `rotate(${tb.angle}deg)` : undefined, transformOrigin: 'center center' }}>
                {renderLyricsLayout(t.text, { ...t.lyric, layoutMode: 'static' }, tb)}
              </div>
            );
          })}
        </TileCanvas>
        <div style={{ position: 'absolute', top: 6, left: 8, display: 'flex', alignItems: 'center', gap: 6, zIndex: 2 }}>
          {isLive && showLiveBadge && <LiveBadge start={slideTimer.start} C={C} PINK={PINK} />}
        </div>
        <div style={{ position: 'absolute', top: 6, right: 8, zIndex: 2, background: 'rgba(0,0,0,0.55)', color: isLive ? PINK : '#FFC72C', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {isTitle ? 'TITLE' : `#${tile.num}`}
        </div>
        {/* Section chip: compact pill so the real render behind it stays visible. Medley tiles add their song tag. */}
        <div style={{ position: 'absolute', bottom: 6, left: 8, zIndex: 2, display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'calc(100% - 16px)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: isLive ? PINK : '#FFC72C', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {tile.medSong && <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, color: '#FFC72C', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{tile.medSong.title || 'Song'}</span>}
          {hasMedia && mediaLayer && mediaLayer.type && <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, background: 'rgba(255,184,0,0.18)', border: '1px solid rgba(255,184,0,0.45)', color: '#FFC72C', borderRadius: 4, padding: '0 4px' }}>{String(mediaLayer.type).toUpperCase()}</span>}
        </div>
      </div>
    );
    if (cacheable) faceCache.set(faceKey, face);
    return face;
  };

  // THE "UP NEXT" PICTURE — the wall's own drawing of the slide that comes
  // next, frozen: its own background, its own text boxes, the same measured
  // fit and the same spread as the projector uses, in the same 16:9 card as
  // the Live Output card above it. The operator sees the wall before the
  // wall is live.
  const renderFrozenWallFace = (tile) => {
    if (!tile) return null;
    const cue = tile.cue;
    const song = tile.medSong || activeSong;
    if (!song) return null;
    const isTitle = tile.isTitle;
    const titleCue = song.title_cue || { id: 'title-card', label: 'Song Title', text: song.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: DEFAULT_LYRIC_SIZE, align: 'center', color: '#ffffff' };
    const theCue = isTitle ? titleCue : cue;
    const st = { ...cueLyricStyle(theCue), layoutMode: 'static' };
    st.isTitle = isTitle;
    const bgInfo = (() => {
      if (isTitle) return songHasBackground(song) ? { type: song.bg_type, value: song.bg_value } : null;
      if (cueHasBackground(cue)) return { type: cue.bg_type, value: cue.bg_value };
      if (songHasBackground(song)) return { type: song.bg_type, value: song.bg_value };
      return null;
    })();
    const style = {
      backgroundType: bgInfo ? bgInfo.type : 'color',
      backgroundValue: bgInfo ? bgInfo.value : '#000000',
      lyric: st,
      texts: textObjectLayers(theCue),
      ghost: ghostLayerOf(theCue),
      fx: theCue.fx || null,
    };
    const k = wallStretch || 1;
    return (
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000', border: '1px solid var(--ui-border2)', boxSizing: 'border-box' }}>
        {style.backgroundType === 'image' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: `url("${String(style.backgroundValue || '').replace(/"/g, '%22')}") center/cover no-repeat` }} />
        )}
        {style.backgroundType === 'video' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            {/* priority: this is the operator's look-ahead — when slots are
                tight it asks before the grid's static thumbnails do. */}
            <TileVideo src={style.backgroundValue} animate={false} priority style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {style.backgroundType === 'animated' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            <AnimatedBg value={style.backgroundValue} k={0.25} />
          </div>
        )}
        <TileCanvas stretch={k}>
          <SlideTextLayers style={style} text={theCue.text || ''} st={st} stretch={k} />
        </TileCanvas>
      </div>
    );
  };

  // --- DOCK TOOL ACTIONS ---
  const applyMediaToActiveSong = async (kind, url) => {
    if (!activeSong) return;
    const next = { ...activeSong };
    if (kind === 'audio') next.audio_url = url;
    else { next.bg_type = kind; next.bg_value = url; }
    setActiveSong(next);
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (kind === 'audio') await ipcRenderer.invoke('db-set-song-audio', next.id, url);
      else await ipcRenderer.invoke('db-set-song-bg', next.id, kind, url);
    }
    fetchMediaLibrary();
  };

  const importMediaAsset = async (e, kind) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (!url) return;
    if (activeSong) await applyMediaToActiveSong(kind, url);
    fetchMediaLibrary();
    if (e.target) e.target.value = '';
  };

  const removeMediaAsset = async (asset) => {
    if (!window.require || !asset) return;
    // Builtin/library rows can carry `value` instead of `url`, or neither —
    // the old code threw on .split and the confirm never appeared.
    const url = asset.url || asset.value || '';
    if (!url) return;
    let fileName = String(url).split('/').pop() || 'this asset';
    try { fileName = decodeURIComponent(fileName); } catch (_) {}
    const ok = await appConfirm(`Remove "${fileName}" from the media library?\n\nSongs that reference it will fall back to their color background.`, { confirmLabel: 'Remove' });
    if (!ok) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-media', url);
    fetchMediaLibrary();
  };

  const toggleAudioPreview = (url) => setAudioPreview(prev => prev === url ? null : url);

  const clearSongAudio = async () => {
    if (!activeSong) return;
    setActiveSong({ ...activeSong, audio_url: null });
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-set-song-audio', activeSong.id, null);
    }
    fetchMediaLibrary();
  };

  // --- OFFLINE BIBLE LIBRARY ACTIONS ---
  const refreshBibleLib = async () => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    setBibleLibLoading(true);
    try {
      const lib = await ipcRenderer.invoke('scripture-list-bibles');
      setBibleLib(lib || []);
      return lib || [];
    } finally {
      setBibleLibLoading(false);
    }
  };

  // `fmt` defaults to state but can be passed explicitly: a format toggle
  // re-fires the live slide in the same tick the state is still stale, so the
  // rebuild must be handed the NEW rules, not the ones it is about to replace.
  const formatBibleVerse = (v, fmt = bibleFmt) => {
    let t = typeof v.text === 'string' ? v.text : '';
    // Rebuilds run over payload text that was ALREADY formatted on the way in
    // (live bg/format re-fire reads meta.source, and services saved before
    // this carried finished text). Strip a leading "<verse> " first so the
    // number below can never stack as "16 16 For God…".
    if (v.verse != null && t.startsWith(`${v.verse} `)) t = t.slice(String(v.verse).length + 1);
    if (fmt.caps) t = t.toUpperCase();
    if (fmt.layout !== 'sentence') {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    t = t.trim();
    // Number layout prefixes the verse ("16 For God so loved…") — the old
    // code returned `t` in both branches, so single verses never showed it.
    return fmt.layout === 'number' && v.verse ? `${v.verse} ${t}` : t;
  };

  // Builds one scripture slide payload. Accepts a single verse
  // ({ verse, text }) or a combined selection ({ verses: [{verse,text}, ...] })
  // so multi-verse output is always ONE fullscreen slide, never N slides.
  // `fmt` defaults to state but takes an override so a format toggle can
  // rebuild with the rules it JUST switched to (state has not flushed yet).
  // `transOverride` lets the LAN phone fire from a translation that is not
  // the desktop's current one, without flipping the desktop UI behind it.
  const buildBiblePayload = (src, bgOverride, fmt = bibleFmt, transOverride = null) => {
    const { book, chapter, verse, text, verses } = src || {};
    const inList = Array.isArray(verses) && verses.length
      ? verses
      : [{ verse, text: text || '' }];
    // Formatting happens HERE rather than at selection time. meta.source
    // therefore keeps the raw chapter lines, which is what lets a live format
    // toggle (or a background switch) rebuild the SAME passage under new
    // rules instead of stacking them on text that already carries the old
    // ones. formatBibleVerse also strips a stale "<verse> " prefix first, so
    // services saved by older builds — where source was pre-formatted — still
    // rebuild cleanly instead of printing "16 16 For God…".
    // NOTE: verse text stays RAW in this list — verse numbers, caps and the
    // word-level {mark} wraps below all derive from it, so the panel word
    // buttons (which split the same raw text) index identically.
    const verseList = inList.map(v => ({ verse: v.verse, raw: typeof v.text === 'string' ? v.text : '' }));
    const first = verseList[0]?.verse;
    const last = verseList[verseList.length - 1]?.verse;
    const refTail = verseList.length > 1 && first !== last ? `${first}-${last}` : (first != null ? `${first}` : '');
    const ref = `${book} ${chapter}${refTail ? `:${refTail}` : ''}`;

    const bodyChunks = [];
    // Marker-pen highlight, word by word: src.markWords holds "verse:word"
    // keys the operator tapped in the Live Output list (word index counts
    // across the verse's lines in order). Tapped words ride inside
    // {mark=COLOR} runs when fmt.mark carries a colour. Marks live in
    // meta.source too, so live toggles and background switches rebuild them
    // instead of dropping them — while a queued slide keeps its baked copy
    // like every other format rule.
    const markColor = typeof fmt.mark === 'string' && fmt.mark ? fmt.mark : null;
    const markWords = new Set(Array.isArray(src?.markWords) ? src.markWords.map(String) : []);
    verseList.forEach((vl) => {
      const ls = vl.raw.split('\n');
      let wi = 0;
      const wrapped = ls.map((ln, li) => {
        const words = ln.trim().split(/\s+/).filter(Boolean);
        const indent = li === 0 ? '' : '  ';
        const out = words.map((w) => {
          const key = `${vl.verse}:${wi++}`;
          const t = fmt.bold ? `**${w}**` : w;
          return (markColor && markWords.has(key)) ? `{mark=${markColor}}${t}{/}` : t;
        });
        return indent + out.join(' ');
      });
      // Standard verse formatting (number prefix, caps, trim) applies to the
      // assembled verse AFTER wrapping — markers survive caps (hex colours
      // are case-insensitive and keys fold on read).
      const formatted = formatBibleVerse({ verse: vl.verse, text: wrapped.join('\n') }, fmt);
      bodyChunks.push(...formatted.split('\n'));
    });
    // Single verse keeps paragraph gaps; multi-verse packs lines tightly so
    // the block can fill the screen without overflow.
    const body = bodyChunks.join(verseList.length > 1 ? '\n' : '\n\n');

    // Scripture always carries its own lyric style: near-fullscreen box +
    // fill-to-fit font so text scales with how many verses are shown. The
    // operator's scripture font + colour win when set; otherwise the
    // template's face, then the stage style. Which box/alignment the block
    // gets is the TEMPLATE's call (see scriptureTemplates.js) — the
    // reference is drawn as its own corner element by ScriptureRef, and the
    // template's id rides in meta so a rebuilt slide keeps the look.
    const tpl = scriptureTemplateOf(fmt.template);
    const scriptureLyric = scriptureLyricFor(tpl, fmt, stageStyle);

    // Background priority: explicit live override → this session's scripture
    // background → the assigned default → first bundled stock photo. A passage
    // is never added to a section with nothing behind it.
    const effectiveBg = bgOverride || bibleMedia || scriptureDefault || scriptureBgLibrary.find(a => a.builtin) || null;
    const style = {
      ...(effectiveBg
        ? { ...stageStyle, backgroundType: effectiveBg.type, backgroundValue: effectiveBg.value }
        : { ...stageStyle }),
      lyric: scriptureLyric,
    };
    const payload = {
      id: 'bible-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      item_type: 'custom_slide',
      title: ref,
      subtitle: `Scripture · ${String(transOverride || bibleTrans).toUpperCase()}`,
      content: `${ref}\n\n${body}`,
      style,
      media_type: effectiveBg?.type || null,
      media_url: effectiveBg?.value || null,
      meta: {
        kind: 'bible',
        book,
        chapter,
        verse: first,
        translation: transOverride || bibleTrans,
        // The reference and the template ride along so the projection can
        // draw the reference as its own element (any corner, any size) and
        // rebuild the same layout later.
        ref,
        template: tpl.id,
        // RAW lines, never the formatted copy: every rebuild (background
        // switch, format toggle) re-derives from here so rules change
        // instead of stacking. Marked word keys ride along so a live
        // re-style keeps the highlight instead of dropping it.
        source: { book, chapter, verses: inList, markWords: [...markWords] },
      },
    };
    lastBibleRef.current = payload;
    return payload;
  };

  // Rebuild the scripture that is on the wall right now and push it in place.
  // Shared by the background switch and the format toggles so both apply the
  // same guard: the passage must still be what the output is actually
  // showing. Clear Lyrics blanks the screen but keeps liveBibleSrcRef, and a
  // toggle must not resurrect that text.
  const refireLiveScripture = (bgOverride, fmt, markOverride) => {
    const raw = liveBibleSrcRef.current;
    if (!raw) return false;
    // A caller changing the mark set (tap-to-highlight) overlays its word
    // keys on the stored source; every other rebuild reuses the stored set
    // untouched.
    const src = Array.isArray(markOverride) ? { ...raw, markWords: markOverride.map(String) } : raw;
    // Read the payload off the displays this session actually drives — not the
    // operator's own currentSlide, which never receives render-live-slide.
    const live = (displays || [])
      .filter(d => targetedDisplays.includes(d.id) && d.content)
      .map(d => d.content)
      .find(c => c.meta && c.meta.kind === 'bible' && c.text) || null;
    if (!live) return false;
    // Reproduce the wall's own background unless the caller is changing it. The
    // stage default is NOT reproduced as an override — that would stamp the
    // global bg into media_url — so it falls through to bibleMedia /
    // scriptureDefault like any fresh build. Only a passage-specific bg is
    // carried across, which is what stops a cleared session override from
    // swapping the art mid-restyling.
    const st = live.style || {};
    const isStageDefault = st.backgroundType === (stageStyle && stageStyle.backgroundType)
      && st.backgroundValue === (stageStyle && stageStyle.backgroundValue);
    const bg = bgOverride
      || (!isStageDefault && st.backgroundValue ? { type: st.backgroundType || 'color', value: st.backgroundValue } : null);
    // This is the SAME slide wearing a new look, so hold on to what makes it
    // that slide. buildBiblePayload mints a fresh id, and a fresh id reads as
    // a different cue: the service row would flip from Stop back to Go.
    const keepTimer = slideTimer;
    const payload = buildBiblePayload(src, bg, fmt);
    payload.id = (liveBibleRef.current && liveBibleRef.current.id) || payload.id;
    fireServiceItemLive(payload);
    setSlideTimer(keepTimer);
    return true;
  };

  // Background assigned to scripture is applied ONLY to scripture (never to
  // songs or custom slides). If a scripture slide is live, switching the
  // background re-fires it immediately so the output updates in place.
  const applyScriptureBg = (next) => {
    setBibleMedia(next);
    if (next) refireLiveScripture(next);
  };

  const selectBibleMediaLive = (type, value, name) => applyScriptureBg(type && value ? { type, value, name } : null);

  // Format (Vv./Plain/Flow, B, Aa) is a LIVE control: the operator toggles it
  // while the passage is already on the wall, so state alone is not enough —
  // the payload has to be rebuilt from raw source and re-fired. `next` is
  // passed into the builder explicitly because React state has not flushed in
  // the same tick. With nothing on air it is a plain state set; the next push
  // picks the rules up.
  const setBibleFmtLive = (updater) => {
    const next = typeof updater === 'function' ? updater(bibleFmt) : updater;
    setBibleFmt(next);
    refireLiveScripture(null, next);
  };

  // Lands in an explicit section (chosen in the Add-to-Playlist dialog) when
  // one is given, otherwise at the end of the section the operator is working
  // in (via insertServiceItem, which honours serviceTargetTitle) instead of
  // piling up after everything else, so the passage sits where it will be used.
  const queueBibleServiceSlide = (src, targetTitle) => {
    insertServiceItem(buildBiblePayload(src), targetTitle);
  };

  // Scripture straight from the left bar's ADD TO panel, so the operator never
  // has to leave the sidebar to drop a passage into the service. It reads the
  // chapter through the same IPC the Scripture tab uses and formats it with the
  // same bibleFmt rules, but deliberately does NOT touch bibleChapter/bibleSel —
  // whatever the Scripture tab had selected stays exactly as it was.
  const addScriptureToPlan = async ({ bookIndex, bookName, chapter, verseRange, abbrev }) => {
    if (!window.require) return { error: 'Not running inside the app.' };
    const { ipcRenderer } = window.require('electron');
    const useTrans = abbrev || bibleTrans;
    let res;
    try {
      res = await ipcRenderer.invoke('scripture-chapter', useTrans, Number(bookIndex), Number(chapter));
    } catch (e) {
      return { error: 'Could not read that chapter.' };
    }
    if (!res || res.error || !Array.isArray(res.verses) || !res.verses.length) {
      return { error: (res && res.error) || 'That chapter could not be loaded.' };
    }
    // Raw on purpose — buildBiblePayload owns formatting, so the queued
    // slide's meta.source can be rebuilt under any later format rules.
    let verses = res.verses.map(v => ({ verse: v.verse, text: v.text }));

    // Optional range: "16", "16-18", "16 – 18". Blank = whole chapter, which is
    // also what the Scripture tab does with no verses selected.
    const range = String(verseRange || '').trim();
    if (range) {
      const m = range.match(/^(\d+)\s*(?:[-\u2013\u2014]\s*(\d+))?$/);
      if (!m) return { error: 'Use a verse range like 16 or 16-18.' };
      const lo = Number(m[1]);
      const hi = Number(m[2] || m[1]);
      verses = verses.filter(v => v.verse >= Math.min(lo, hi) && v.verse <= Math.max(lo, hi));
      if (!verses.length) return { error: `No verses ${lo}${hi !== lo ? '-' + hi : ''} in ${res.book} ${res.chapter}.` };
    }

    insertServiceItem(buildBiblePayload({ book: res.book || bookName, chapter: res.chapter || chapter, verses }));
    const first = verses[0].verse;
    const last = verses[verses.length - 1].verse;
    return {
      ok: true,
      ref: `${res.book || bookName} ${res.chapter || chapter}:${first === last ? first : `${first}-${last}`}`,
      count: verses.length,
      translation: useTrans,
      target: serviceTargetTitle,
    };
  };

  const fireBibleLive = (src) => {
    fireServiceItemLive(buildBiblePayload(src));
  };

  // Ordered list of currently selected verses (empty selection = whole chapter).
  const selectedBibleVerses = () => {
    if (!bibleChapter) return [];
    // Raw text: buildBiblePayload applies bibleFmt, so a slide queued now can
    // still be re-formatted later from its stored source.
    return (bibleChapter.verses || [])
      .filter(v => bibleSelVerses.length === 0 || bibleSelVerses.includes(v.verse))
      .map(v => ({ verse: v.verse, text: v.text }));
  };

  // One combined slide for the whole selection — multi-verse output is a
  // single fullscreen page, not a queue of separate verses.
  const fireBibleSelectionLive = () => {
    const verses = selectedBibleVerses();
    if (!verses.length) return;
    fireBibleLive({
      book: bibleChapter.book,
      chapter: bibleChapter.chapter,
      verses,
    });
  };

  // Scripture live on the wall, for the tap-to-highlight word list in the
  // Live Output panel: verses + marked WORD keys straight from the live
  // source (meta.source carries them, so queued slides keep working). Same
  // on-air guards as before — a cleared output shows no list.
  const liveBible = (() => {
    const item = liveBibleRef.current;
    if (!item || !item.meta || item.meta.kind !== 'bible') return null;
    if (!activeCue || activeCue.id !== item.id) return null;
    const src = (item.meta && item.meta.source) || liveBibleSrcRef.current || {};
    const verses = Array.isArray(src.verses) ? src.verses : [];
    if (!verses.length) return null;
    return {
      book: src.book || item.title || '',
      chapter: src.chapter || '',
      verses: verses.map((v) => ({ verse: Number(v.verse), text: String(v.text || '') })),
      markWords: (Array.isArray(src.markWords) ? src.markWords : []).map(String),
    };
  })();
  // Flip one "verse:word" key in the live mark set and re-fire in place
  // (same id, so the service row keeps its Stop state). Marking the first
  // word auto-switches the highlighter on with the default colour so the
  // tap visibly lands.
  const toggleLiveBibleWord = (key) => {
    if (!liveBible) return false;
    const k = String(key);
    const cur = new Set(liveBible.markWords);
    if (cur.has(k)) cur.delete(k); else cur.add(k);
    let fmt = bibleFmt;
    if (cur.size && !fmt.mark) {
      fmt = { ...fmt, mark: '#FDE047' };
      setBibleFmt(fmt);
    }
    refireLiveScripture(null, fmt, [...cur]);
    return true;
  };

  // "Add to Playlist" from the Scripture workspace. A passage cannot be
  // queued into nothing, and it should not silently land wherever the last
  // click left the target — so: no loaded show → tell the operator to load
  // one; otherwise ask which section it belongs to and insert it there.
  const requestBibleQueue = async () => {
    const items = activeService?.items || [];
    if (!items.length) {
      await appAlert('There must be a loaded show in the service order before scripture can be added to the playlist.', { title: 'No show loaded' });
      return false;
    }
    const verses = selectedBibleVerses();
    if (!verses.length) {
      await appAlert('Choose a book, chapter and verses first — then add them to a section.', { title: 'No passage selected' });
      return false;
    }
    const first = verses[0].verse;
    const last = verses[verses.length - 1].verse;
    setBibleQueueModal({
      reference: `${bibleChapter.book} ${bibleChapter.chapter}:${first === last ? first : `${first}-${last}`}`,
      count: verses.length,
      verses,
      initialTitle: serviceTargetTitle,
      // Real headers insert after their own block. The synthetic "General"
      // group (items sitting BEFORE the first header) becomes '__start__' so
      // picking it drops the passage back where those items are, not at the
      // end of the show.
      sections: (() => {
        const real = new Set(items.filter(i => i.item_type === 'section_header').map(i => i.title));
        return serviceSections().map(s => ({
          id: real.has(s.title) ? s.title : '__start__',
          title: s.title,
          subtitle: s.subtitle,
          count: s.items.length,
        }));
      })(),
    });
    return true;
  };

  const confirmBibleQueue = (sectionTitle) => {
    const m = bibleQueueModal;
    setBibleQueueModal(null);
    if (!m) return;
    // '__end__' = append to the show, '__start__' = the pre-header group,
    // a title = that section.
    const target = sectionTitle === '__end__' || sectionTitle == null ? null : sectionTitle;
    if (target && target !== '__start__') setServiceTargetTitle(target);
    queueBibleServiceSlide(
      { book: bibleChapter.book, chapter: bibleChapter.chapter, verses: m.verses },
      target,
    );
  };

  const queueBibleSelection = (targetTitle) => {
    const verses = selectedBibleVerses();
    if (!verses.length) return;
    queueBibleServiceSlide({
      book: bibleChapter.book,
      chapter: bibleChapter.chapter,
      verses,
    }, targetTitle);
  };

  const loadBibleBooks = async (abbrev = bibleTrans) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('scripture-books', abbrev);
    if (res && res.books) setBibleBooks(res);
    return res;
  };

  // Latest navigation wins: tapping chapters 1-then-5 fast must not land
  // chapter 1's verses under chapter 5's selection (or push them live).
  const bibleLoadSeqRef = useRef(0);
  const loadBibleChapter = async (abbrev = bibleTrans, bookIndex = bibleSel.bookIndex, chapter = bibleSel.chapter) => {
    if (!window.require || !abbrev) return;
    const { ipcRenderer } = window.require('electron');
    const seq = ++bibleLoadSeqRef.current;
    const res = await ipcRenderer.invoke('scripture-chapter', abbrev, bookIndex, chapter);
    if (seq !== bibleLoadSeqRef.current) return res;
    if (res && !res.error && res.verses) {
      setBibleChapter(res);
      setBibleSel({ bookIndex: res.bookIndex, bookName: res.book, chapter: res.chapter, totalChapters: res.totalChapters });
      setBibleSelVerses([]);
    }
    return res;
  };

  const selectBibleBook = (book) => {
    setBibleSearchResults(null);
    setBibleChapter(null);
    setBibleSelVerses([]);
    bibleLastVerseRef.current = null;
    setBibleSel({ bookIndex: book.nr, bookName: book.name, chapter: null, totalChapters: book.chapters });
  };

  const selectBibleChapter = async (ch) => {
    setBibleSearchResults(null);
    setBibleFocusedVerse(null);
    await loadBibleChapter(bibleTrans, bibleSel.bookIndex, ch);
  };

  // Verse click modes only update the local selection — nothing hits the
  // projector until the operator presses "Push to Display" (Live Output panel
  // or scripture toolbar).
  const handleBibleVerseClick = (e, v) => {
    if (!bibleChapter) return;
    const num = v.verse;

    if (e.shiftKey && bibleLastVerseRef.current != null) {
      const lo = Math.min(bibleLastVerseRef.current, num);
      const hi = Math.max(bibleLastVerseRef.current, num);
      const range = [];
      for (let n = lo; n <= hi; n++) range.push(n);
      setBibleSelVerses(range);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setBibleSelVerses(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]);
      bibleLastVerseRef.current = num;
      return;
    }
    setBibleSelVerses([num]);
    bibleLastVerseRef.current = num;
  };

  // Breadcrumb: jump back to the Books root
  const resetBibleToBooks = () => {
    setBibleSearchResults(null);
    setBibleChapter(null);
    setBibleSelVerses([]);
    bibleLastVerseRef.current = null;
    setBibleSel({ bookIndex: null, bookName: '', chapter: null, totalChapters: 0 });
  };

  // Breadcrumb: jump back to the selected book (clears active chapter)
  const resetBibleToBook = () => {
    if (!bibleSel.bookIndex) return;
    setBibleSearchResults(null);
    setBibleChapter(null);
    setBibleSelVerses([]);
    setBibleFocusedVerse(null);
    bibleLastVerseRef.current = null;
    setBibleSel(prev => ({ ...prev, chapter: null }));
  };

  const openBibleTranslation = async (abbrev) => {
    setBibleTrans(abbrev);
    setBibleSearchResults(null);
    setBibleChapter(null);
    setBibleSel({ bookIndex: null, bookName: '', chapter: null, totalChapters: 0 });
    setBibleSelVerses([]);
    bibleLastVerseRef.current = null;
    await loadBibleBooks(abbrev);
  };

  const downloadBible = async (abbrev) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    setBibleDL({ abbrev, progress: 0, running: true });
    const onProg = (e, p) => {
      if (p.abbrev !== abbrev) return;
      if (p.done) {
        ipcRenderer.removeListener('scripture-download-progress', onProg);
        setBibleDL({ abbrev: null, progress: 1, running: false });
      } else {
        setBibleDL({ abbrev, progress: p.progress, running: true });
      }
    };
    ipcRenderer.on('scripture-download-progress', onProg);
    const res = await ipcRenderer.invoke('scripture-download-bible', abbrev);
    if (res && res.error) {
      ipcRenderer.removeListener('scripture-download-progress', onProg);
      setBibleDL({ abbrev: null, progress: 0, running: false });
      await appAlert(res.error);
    }
    await refreshBibleLib();
  };

  const deleteBibleTranslation = async (abbrev) => {
    if (!window.require) return;
    if (!(await appConfirm(`Delete ${abbrev.toUpperCase()} from this device? It must be re-downloaded to use offline.`, { confirmLabel: 'Delete' }))) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('scripture-delete-bible', abbrev);
    const still = await refreshBibleLib();
    const stillThere = still.find(b => b.abbrev === abbrev && b.installed);
    if (!stillThere && bibleTrans === abbrev) {
      setBibleTrans('kjv');
      setBibleChapter(null);
      setBibleBooks(null);
    }
  };

  useEffect(() => {
    if (!window.require) return;
    refreshBibleLib().then(lib => {
      const active = (lib || []).find(b => b.installed);
      if (active) openBibleTranslation(active.abbrev);
    });
  }, []);

  const resolveBibleReference = async () => {
    if (!window.require || !bibleRef.trim()) return;
    const { ipcRenderer } = window.require('electron');
    // Always try to parse it as a reference first — the resolver now
    // understands numbered books ("1 peter", "2 chronicles 7") as well as
    // "john 3:16". Anything that is not a reference (keyword phrases)
    // falls through to the full-text search below.
    // NOTE: the old pre-filter routed any input whose FIRST token had a
    // digit straight to keyword search, so 1–2 Samuel / 1–3 Chronicles /
    // 1–3 John / 1–2 Peter could never be quick-jumped to ("1 peter"
    // searched for those literal words in verse text → no matches).
    const res = await ipcRenderer.invoke('scripture-resolve', bibleTrans, bibleRef.trim());
    if (res && res.error) {
      const sres = await ipcRenderer.invoke('scripture-search', bibleTrans, bibleRef.trim());
      setBibleSearchResults(sres && sres.results ? sres.results : []);
      return;
    }
    if (res && res.bookIndex) {
      setBibleSearchResults(null);
      setBibleSel({ bookIndex: res.bookIndex, bookName: res.book, chapter: res.chapter, totalChapters: res.totalChapters });
      await loadBibleChapter(bibleTrans, res.bookIndex, res.chapter);
      if (res.verse) {
        setBibleSelVerses([res.verse]);
        bibleLastVerseRef.current = res.verse;
      }
    }
  };

  const searchBibleKeywords = async () => {
    if (!window.require || !bibleSearchQuery.trim()) return;
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('scripture-search', bibleTrans, bibleSearchQuery.trim());
    setBibleSearchResults(res && res.results ? res.results : []);
  };

  // Derived translation list for the header selector flyout
  const bibleActiveEntry = bibleLib.find(b => b.abbrev === bibleTrans) || null;
  const bibleInstalledLib = bibleLib.filter(b => b.installed);
  const bibleLibQueryTrim = bibleLibQuery.trim().toLowerCase();
  const bibleLibFiltered = bibleLib.filter(b => !bibleLibQueryTrim || b.name.toLowerCase().includes(bibleLibQueryTrim) || (b.code || b.abbrev).toLowerCase().includes(bibleLibQueryTrim) || (b.lang || '').toLowerCase().includes(bibleLibQueryTrim));

  const deleteSavedService = async (serviceId) => {
    if (!window.require) return;
    if (!(await appConfirm('Delete this saved service plan?', { confirmLabel: 'Delete' }))) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-service', serviceId);
    fetchServices();
  };

  const shellOpenDataFolder = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('open-data-folder');
    }
  };

  const dockItems = [
    { id: 'shows', label: 'Shows', iconId: 'list-video', accent: true },
    { id: 'sermon', label: 'Slideshow', iconId: 'presentation', accent: false },
    { id: 'media', label: 'Media', iconId: 'film', accent: false },
    { id: 'videos', label: 'Videos', iconId: 'clapperboard', accent: false },
    { id: 'audio', label: 'Audio', iconId: 'music', accent: false },
    { id: 'countdown', label: 'Countdown', iconId: 'timer', accent: false },
    { id: 'stage', label: 'Stage', iconId: 'mic', accent: false },
    { id: 'scripture', label: 'Scripture', iconId: 'book-open', accent: false },
    { id: 'outputs', label: 'Outputs', iconId: 'monitor', accent: false },
    { id: 'settings', label: 'Settings', iconId: 'settings', accent: false }
  ];

  const handleCheckUpdates = async () => {
    const fallback = appInfo?.version || '0.0.0';
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setAboutStatus('Checking for updates...');
        setUpdateReady('checking');
        const result = await ipcRenderer.invoke('check-for-updates');
        if (result.error) {
          setAboutStatus(`Update check failed: ${result.error}`);
          setUpdateReady('error');
          return;
        }
        if (result.updateInfo && result.isAvailable) {
          setUpdateVersion(result.updateInfo.version || null);
          setAboutStatus(`Update available: v${result.updateInfo.version}`);
          setUpdateReady('available');
        } else if (result.updateInfo && result.updateInfo.version) {
          // Same-or-older remote (or a dev build ahead of the feed): say so
          // plainly instead of offering a Download that would just answer
          // "up to date".
          setUpdateVersion(null);
          setAboutStatus(`You're up to date — v${result.currentVersion || fallback} is the latest.`);
          setUpdateReady('uptodate');
        } else {
          setAboutStatus(`You're up to date (v${fallback}).`);
          setUpdateReady('uptodate');
        }
      }
    } catch (e) {
      setAboutStatus(`Update check failed: ${e.message}`);
      setUpdateReady('error');
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setAboutStatus('Starting download...');
        setUpdateReady('downloading');
        setUpdateProgress(null);
        const result = await ipcRenderer.invoke('download-update');
        if (result.error) {
          setAboutStatus(`Download failed: ${result.error}`);
          setUpdateReady('error');
          setUpdateProgress(null);
        }
      }
    } catch (e) {
      setAboutStatus(`Download failed: ${e.message}`);
      setUpdateReady('error');
      setUpdateProgress(null);
    }
  };

  // Parameterized so the download toast (registered once, stale closure) can
  // install the version it just announced instead of whatever state holds.
  const installUpdateVersion = useCallback(async (version) => {
    try {
      if (window.require) {
        // Remember what is being installed: the app quits below, and the
        // post-relaunch boot compares this flag against its own version to
        // confirm the install landed (the Complete state).
        if (version) { try { localStorage.setItem('kog_update_installing', version); } catch {} }
        setUpdateReady('installing');
        setAboutStatus('Installing update...');
        setUpdateProgress(null);
        // Let the Installing state paint before the app quits into the NSIS
        // installer — without the beat the button never visibly changes.
        await new Promise((r) => setTimeout(r, 900));
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('install-update');
      }
    } catch (e) {
      try { localStorage.removeItem('kog_update_installing'); } catch {}
      setAboutStatus(`Install failed: ${e.message}`);
      setUpdateReady('downloaded');
    }
  }, []);

  const handleInstallUpdate = () => installUpdateVersion(updateVersion);

  const handleDockSelect = (item) => {
    if (item.id === 'outputs') { setShowOutputMonitor(true); return; }
    // Settings is a dialog, not a workspace: opening it must not replace the
    // page the operator is on, so the sidebar selection stays where it was.
    if (item.id === 'settings') { setShowSettings(true); return; }
    setDockTab(item.id);
    // The sidebar is persistent production navigation now: changing workspace
    // never hides it. Operators deliberately collapse it with the panel button
    // when they want the whole centre width.
    setLeftOpen(true);
    // The Countdown editor brings its own live preview + Go Live, so while
    // that tab is active the global right sidebar stays visible but LOCKED
    // (LiveOutputPanel's `locked` prop) instead of closing — the countdown
    // owns the wall, so firing lyrics from the sidebar would fight it.
    // rightOpen itself is left alone: the sidebar never auto-closes.
    setScheduleView(item.id === 'shows' ? scheduleView : 'schedule');
  };

  // New Song flow, step 1: ask HOW to start (Manual Builder vs Smart
  // Paste) before any editor state is created. The sidebar "+ New" button
  // calls this; startNewSong() below opens the editor once picked.
  const handleNewSong = () => {
    setNewSongPromptOpen(true);
  };

  // New Song flow, step 2 — mode: 'manual' (canvas builder) or
  // 'auto' (Smart Auto-Paste tab). Editing an existing song never goes
  // through the prompt.
  const startNewSong = (mode) => {
    setNewSongPromptOpen(false);
    openEditorOn({ id: null, title: '', artist: '', category: 'Worship', cues: [{ label: 'Verse 1', text: '', box: DEFAULT_BOX, locked: false }] }, mode);
  };

  // Safety: if the editor opens through another path (edit buttons, menus)
  // while the prompt is up, dismiss the prompt so it can't reappear after
  // the editor closes.
  useEffect(() => {
    if (isEditorOpen) setNewSongPromptOpen(false);
  }, [isEditorOpen]);

  const leftContent = dockTab;

  const monitorContent = displays.find(d => d.id === 1)?.content || null;

  // Wall actually on: the projector output started (dock Outputs button or a
  // chosen display). Firing cues with no output running lights nothing, so
  // the preview card only goes red while a wall can show it.
  const projectorOn = !!((outputs || []).find(o => o.id === 'projector' && o.enabled));

  // Physical wall shape for countdown previews (tab + monitor): since the
  // projector fills its whole viewport for countdown, a fixed 16:9 preview
  // box disagrees with any other wall — LED included. Resolve the bound
  // projector display's real resolution; fall back to the declared output
  // aspect, then 16:9. Lyrics previews stay on outputAspect (composition
  // view); only timer content uses this.
  const wallAspect = useMemo(() => {
    try {
      const proj = outputs.find(o => o.id === 'projector') || outputs.find(o => o.role === 'lyrics') || null;
      // A pixel-preset or custom LED region IS the output window, so its shape
      // is the wall shape even when the bound display has a different native
      // ratio. Using the display here made a Fill preview disagree with the
      // actual (now correctly sized) output window.
      const vp = proj && proj.viewport && proj.viewport.enabled ? proj.viewport : null;
      if (vp) {
        const vw = Number(vp.w);
        const vh = Number(vp.h);
        if (vw > 0 && vh > 0) return `${vw} / ${vh}`;
      }
      const rm = String((proj && proj.resolution) || '').match(/^(\d+)x(\d+)$/);
      if (rm && Number(rm[1]) > 0 && Number(rm[2]) > 0) return `${rm[1]} / ${rm[2]}`;
      const pid = proj && proj.displayId;
      // A Native dev preview is an OS window inside the primary work area
      // (taskbar excluded), not the full display. Use that shape so a Fill
      // preview card matches the real preview window instead of a 16:9 screen.
      if (pid === 'preview' && typeof window !== 'undefined' && window.screen) {
        const aw = Number(window.screen.availWidth);
        const ah = Number(window.screen.availHeight);
        if (aw > 0 && ah > 0) return `${aw} / ${ah}`;
      }
      const hit = pid != null && pid !== '' && pid !== 'preview'
        ? (outputDisplays || []).find(d => String(d.id) === String(pid))
        : null;
      const pw = Number(hit && hit.width);
      const ph = Number(hit && hit.height);
      if (pw > 0 && ph > 0) return `${pw} / ${ph}`;
    } catch {}
    const m = String(outputAspect || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (m && Number(m[2])) return `${m[1]} / ${m[2]}`;
    return '16 / 9';
  }, [outputs, outputDisplays, outputAspect]);

  // THE WALL'S SHAPE — how wide the design space is on the wall. A named
  // output ratio keeps the 16:9 composition; Fill spreads the design space
  // to the physical wall (the boxes widen, the type keeps its size). Every
  // picture of the wall — the live card, the "Up Next" card, the phone —
  // uses this one number, so they are all the same picture.
  const wallStretch = useMemo(() => {
    const projAspect = (outputs || []).find((o) => o.id === 'projector')?.aspect || outputAspect;
    if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(String(projAspect || ''))) return 1;
    const w = String(wallAspect || '16 / 9').match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    const ar = w && Number(w[2]) ? Number(w[1]) / Number(w[2]) : 16 / 9;
    return ar / (16 / 9);
  }, [outputs, outputAspect, wallAspect]);

  // The shape the WALL actually draws: the output's own ratio when it names
  // one, otherwise the physical wall (Fill). The Live Output card renders
  // THIS, so the card is a true picture of the wall at any setting.
  const wallFrameAspect = useMemo(() => {
    const projAspect = (outputs || []).find((o) => o.id === 'projector')?.aspect || outputAspect;
    return /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(String(projAspect || '')) ? String(projAspect) : String(wallAspect || '16 / 9');
  }, [outputs, outputAspect, wallAspect]);

  // Output windows share this component. These returns MUST come after every
  // hook above (they used to sit where wallStretch now is; an early return
  // before a hook changes the hook count and crashes React). They render the
  // projector / stage only — never the console UI.
  if (isStage) {
    return <StageDisplay currentSlide={currentSlide} C={C} cfg={stageFeed?.cfg || null} flow={stageFeed?.flow || null} chord={stageFeed?.chord || null} />;
  }

  if (isOutput) {
    return outputRole === 'stage'
      ? <StageDisplay currentSlide={currentSlide} C={C} cfg={stageFeed?.cfg || null} flow={stageFeed?.flow || null} chord={stageFeed?.chord || null} />
      : <ProjectorDisplay currentSlide={currentSlide} C={C} aspect={outputAspect} config={outputCfg} overlay={liveOverlay} draw={drawStrokes} lift={lyricLift} />;
  }

  if (isProjector) {
    return <ProjectorDisplay currentSlide={currentSlide} C={C} aspect={outputAspect} overlay={liveOverlay} draw={drawStrokes} lift={lyricLift} />;
  }

  if (showSplash) {
    return <SplashScreen C={C} logoImage={logoImage} />;
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        services={services}
        C={C}
        PINK={PINK}
        ACCENT={ACCENT}
        logoImage={logoImage}
        onStartNewShow={() => { setShowWelcome(false); openNewShow(); }}
        onOpenSavedShows={() => { setShowWelcome(false); setDockTab('shows'); setLeftOpen(true); setActiveTab('service'); }}
        onStartBlank={startBlankWorkspace}
        onOpenRecent={(id) => { setShowWelcome(false); loadService(id); setDockTab('shows'); setLeftOpen(true); setActiveTab('service'); }}
      />
    );
  }

  // THE LIVE OUTPUT CARD — the projector itself, in framed mode.
  //
  // Not a copy of the wall: this is the SAME component the projector window
  // runs, with the wall's own frame math (frameAspect = the shape the output
  // actually draws) and the same measured fit for every text box. So the card
  // can never drift from the actual output — same background, same lyric
  // boxes, same extra text boxes, same wrap. The card itself is a fixed 16:9
  // window (it never changes size when the output aspect is adjusted) and the
  // wall's picture is letterboxed inside it.
  const renderOutputPreview = () => (
    <div ref={setPreviewWrapRef} style={{ pointerEvents: 'none', position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: '#000', border: 'none', boxSizing: 'border-box' }}>
      <ProjectorDisplay framed frameAspect={wallFrameAspect} currentSlide={monitorContent} config={{ aspect: 'fill' }} />
    </div>
  );

  const appValue = {
    logoImage,
    themeDark, setThemeDark, toggleTheme, iconTheme, setIconTheme,
    // Settings tab (updater UI moved here from the About modal).
    aboutStatus, updateReady, updateProgress, updateVersion,
    handleCheckUpdates, handleDownloadUpdate, handleInstallUpdate,
    ACCENT, ACCENT_SOFT, ACCENT_SOFT_2, C, PINK, ACCENT_PINK, PINK_SOFT, PINK_SOFT_2, NEBULA, PINK2, ACCENCY,
    isProjector, setIsProjector, isStage, setIsStage, showSplash, setShowSplash, showWelcome, setShowWelcome,
    currentSlide, setCurrentSlide,
    // Stage dock tab: config (edited), flow (computed), last payload (preview).
    stageCfg, setStageCfg, stageFlow, stageSnap,
    stageBpmPopup, setStageBpmPopup,
    activeTab, setActiveTab, songs, setSongs, searchQuery, setSearchQuery, showsQuery, setShowsQuery,
    showsCollapsed, setShowsCollapsed, songsCollapsed, setSongsCollapsed, serviceDragOver, setServiceDragOver,
    activeCategory, setActiveCategory, songCategories, activeSong, setActiveSong, activeCue, setActiveCue,
    leftOpen, setLeftOpen, viewTab, setViewTab, rightOpen, setRightOpen, showHotkeys, setShowHotkeys, showMoreMenu, setShowMoreMenu,
    dockTab, setDockTab, scheduleView, setScheduleView, rightTab, setRightTab,
    mediaLibrary, setMediaLibrary, scriptureBgLibrary, libraryStats, setLibraryStats, appInfo, setAppInfo, audioPreview, setAudioPreview, audioVolume, setAudioVolume,
    bibleLib, setBibleLib, bibleTrans, setBibleTrans, bibleBooks, setBibleBooks, bibleSel, setBibleSel, bibleChapter, setBibleChapter,
    bibleDL, setBibleDL, bibleLibQuery, setBibleLibQuery, bibleLibLoading, setBibleLibLoading, bibleTransOpen, setBibleTransOpen,
    bibleHelpOpen, setBibleHelpOpen, bibleMedia, setBibleMedia, bibleMediaOpen, setBibleMediaOpen, bibleTestament, setBibleTestament,
    scriptureDefault, setScriptureDefault, scriptureDefaultOptions, assignScriptureDefault,
    scripturePicker, setScripturePicker, chooseScriptureMedia,
    bibleBookQuery, setBibleBookQuery, bibleRef, setBibleRef, bibleSearchQuery, setBibleSearchQuery, bibleSearchResults, setBibleSearchResults,
    // setBibleFmt is the LIVE setter everywhere: toggling format in the
    // Scripture header or in Live Output both re-fire a passage that is
    // already on the wall, instead of only affecting the next push.
    bibleSelVerses, setBibleSelVerses, bibleFocusedVerse, setBibleFocusedVerse, bibleFmt, setBibleFmt: setBibleFmtLive,
    showModalOpen, setShowModalOpen, showBuilder, setShowBuilder,
    builderSongQuery, setBuilderSongQuery, builderSrcSongQuery, setBuilderSrcSongQuery, builderSheet, setBuilderSheet,
    builderTargetSecId, setBuilderTargetSecId, builderTargetSectionId,
    builderDensity, setBuilderDensity, gridDensity, setGridDensity, builderTileIdx, setBuilderTileIdx, builderCollapsed, setBuilderCollapsed,
    builderRehearse, setBuilderRehearse, builderActiveSong, setBuilderActiveSong, builderSongDetails, setBuilderSongDetails,
    selectedServiceId, setSelectedServiceId, serviceDirty, slideTimer, setSlideTimer, services, setServices, templates, setTemplates,
    selectedTemplateId, setSelectedTemplateId, dragIndex, setDragIndex,
    showTemplateNameModal, setShowTemplateNameModal, templateNameValue, setTemplateNameValue,
    activeService, setActiveService, customSlideModal, setCustomSlideModal, newSlideData, setNewSlideData,
    customSlideEditIdx, openCustomSlideEditor, closeCustomSlideEditor,
    isEditorOpen, setIsEditorOpen, editorMode, setEditorMode, rawPasteText, setRawPasteText,
    editingSong, setEditingSong, linesPerSlide, setLinesPerSlide, videoList, setVideoList, videoIdx, setVideoIdx,
    isParsing, setIsParsing,
    editorCueIdx, setEditorCueIdx, canvasEdit, setCanvasEdit, boxDrag, setBoxDrag, canvasScale, setCanvasScale,
    dragFrom, setDragFrom, showSlideProps, setShowSlideProps, serviceCollapsed, setServiceCollapsed,
    serviceAddMenu, setServiceAddMenu, serviceSongQuery, setServiceSongQuery, serviceTargetTitle, setServiceTargetTitle, serviceSectionTitles,
    serviceMediaPicker, setServiceMediaPicker,
    previewScale, setPreviewScale, outputAspect, setOutputAspect, wallAspect, aiStatus, setAiStatus, processAiAutofix,
    stageStyle, setStageStyle, displays, setDisplays, targetedDisplays, setTargetedDisplays,
    outputDisplays, outputs, updateOutput, addOutput, removeOutput, setOutputRunning, selectOutputDisplay, selectStageDisplay, showOutputMonitor, setShowOutputMonitor,
    bibleLastVerseRef, canvasWrapRef, editAreaRef, previewObsRef, setPreviewWrapRef,
    fetchSongs, fetchServices, fetchMediaLibrary, fetchLibraryStats, fetchAppInfo, fetchTemplates,
    applyTemplate, saveCurrentTemplate, confirmSaveTemplate, removeTemplate, selectSong, editSong,
    selectBibleMedia, importBibleMedia, selectBibleMediaLive, handleNextCue, handlePrevCue, toggleTarget, addNewDisplay, persistMediaFile, persistCountdownFile,
    sendStageData, isPlainBg, cueHasBackground,
    songHasBackground, songBackgroundStyle, resolutionStyle, defaultShowSections, openNewShow, closeShowModal,
    addSongToSection, addSlideToSection, updateShowItem, removeShowItem, addShowSection, renameShowSection,
    removeShowSection, moveShowSection, showTotalSeconds, createShow, selectBuilderItem, builderItemSlideCount,
    builderFlatItems, builderTotalSlides, builderCurrentEntry, builderGoLive, builderAdvance, builderUpNext,
    addShowBuilderMedia, addShowBuilderExistingMedia, addShowBuilderPlaceholder, fireCueLive, fireTitleLive, fireServiceItemLive,
    openMedleyForRow, saveMedley, fireMedleySlideAt, openArrangementForRow, arrangementStatus,
    toggleDevProjectorWindow, toggleStageWindow, addSongToService, addHeaderToService, renameServiceHeader, addCustomSlideToService,
    reorderServiceItem, moveServiceBlock, moveServiceItem, removeServiceItem, serviceOrderCount, serviceSlideCount,
    serviceStatusIcon, serviceItemIsLive, toggleServiceCollapse, expandAllServiceSections, collapseAllServiceSections,
    clearServiceOrder, addMediaItemToService, addExistingMediaToService, fireServiceMediaLive, stopServiceItemLive, saveCurrentService, loadService, queueShowIntoService,
    presentations, setPresentations, fetchPresentations, isPresentationOpen, editingDeck, setEditingDeck,
    openPresentationEditor, closePresentationEditor, openPresentation, savePresentationDeck, deletePresentationDeck, importPowerPoint,
    presentDeck, firePresentationSlide, addPresentationToService, activePresentation, stopPresentation,
    processAutoPaste, moveCue, duplicateCue, setCueBackground, cueFileToBackground, setSongBackground,
    songBgFileToBackground, clearCueBackground, splitCuesToLines, clampNum, editorCue, editorBox, updateCue, updateCueThrottled, updateTextObject, updateTextObjectThrottled, moveTextObjectInCue, addTextObjectToCue, removeTextObjectFromCue, duplicateTextObjectInCue, applyPatchToAllCues,
    baseGroupLabel, nextSuffixLetter, splitCueAtTextareaCaret, reorderCues,
    startBoxDrag, onStagePointerMove, endBoxDrag, ToolbarBtn, cueLyricStyle, handleSaveSong,
    isSongDraftDirty, clearSongDraft, openEditorOn,
    previewAnimation,
    fireCountdownLive, stopCountdownLive, pauseCountdownLive, resumeCountdownLive, fireVideoLive, fireOverlay, clearOverlay, liveOverlay, countdown, setCountdown, cdTemplates, setCdTemplates, sameSongId, clearWorkspace,
    sermon, sermonLoad, sermonSetLayer, sermonNav, sermonGoto, sermonClose, sermonShots, outputLayers,
    handleDeleteSong, handleToggleFavorite, handleExport, handleImport, serviceSections, resolveBg, appConfirm, appAlert,
    activeSlideIndex, groupLabels, slideGrid, renderSlideFace, applyMediaToActiveSong, importMediaAsset, removeMediaAsset,
    toggleAudioPreview, clearSongAudio, refreshBibleLib, formatBibleVerse, buildBiblePayload, queueBibleServiceSlide,
    addScriptureToPlan,
    fireBibleLive, fireBibleSelectionLive, queueBibleSelection, requestBibleQueue, loadBibleBooks, loadBibleChapter, selectBibleBook,
    selectBibleChapter, handleBibleVerseClick, resetBibleToBooks, resetBibleToBook, openBibleTranslation, downloadBible,
    deleteBibleTranslation, resolveBibleReference, searchBibleKeywords, bibleActiveEntry, bibleInstalledLib,
    bibleLibQueryTrim, bibleLibFiltered, bibleAllBooks, bibleOtCount, bibleNtCount, bibleFilteredBooks, bibleStep,
    deleteSavedService, shellOpenDataFolder, dockItems, handleDockSelect, handleNewSong,
    leftContent, monitorContent, renderOutputPreview, DEFAULT_BOX,
    drawStrokes, addDrawStroke, undoDrawStroke, clearDrawStrokes,
  };

  return (
    <AppProvider value={appValue}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--ui-scroll-track); }
        ::-webkit-scrollbar-thumb { background: var(--ui-scroll-thumb); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideLeft { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes zoomOut { from { opacity: 0; transform: scale(1.2); } to { opacity: 1; transform: scale(1); } }
        @keyframes wordFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wordRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lineReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
        @keyframes typeOn { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
        @keyframes charCascade { 0% { opacity: 0; transform: translateY(8px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes blurIn { from { opacity: 0; filter: blur(12px); } to { opacity: 1; filter: blur(0); } }
        @keyframes flipIn { from { opacity: 0; transform: perspective(700px) rotateX(85deg); } to { opacity: 1; transform: perspective(700px) rotateX(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.08); } 70% { transform: scale(0.94); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes dropIn { 0% { opacity: 0; transform: translateY(-70px); } 60% { opacity: 1; transform: translateY(10px); } 80% { transform: translateY(-4px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes swayIn { 0% { opacity: 0; transform: translateX(-36px) rotate(-3deg); } 50% { opacity: 1; transform: translateX(10px) rotate(2deg); } 100% { opacity: 1; transform: translateX(0) rotate(0); } }
        @keyframes splitIn { 0% { opacity: 0; clip-path: inset(50% 0 50% 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }
        @keyframes wipeUp { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0 0 0 0); } }
        @keyframes spinIn { 0% { opacity: 0; transform: rotate(-180deg) scale(0.5); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
        @keyframes neonFlash { 0% { opacity: 0; } 8% { opacity: 1; } 14% { opacity: 0.15; } 20% { opacity: 1; } 28% { opacity: 0.35; } 36% { opacity: 1; } 100% { opacity: 1; } }
      `}</style>

      {isEditorOpen ? (
      <>
      {/* ===== TOP HEADER ===== */}
      <TopHeader
        C={C}
        PINK={PINK}
        ACCENT={ACCENT}
        dockTab={dockTab}
        showName={activeService?.name || ''}
        showDate={activeService?.date || ''}
        activeCue={activeCue}
        activeLabel={activeCue?.label || ''}
        slideIndex={activeSlideIndex}
        slideCount={slideGrid.length}
        projectorOn={projectorOn}
        outputDisplays={outputDisplays}
        selectedOutputDisplay={outputs.find(o => o.id === 'projector')?.displayId ?? null}
        selectOutputDisplay={selectOutputDisplay}
        onOpenOutputs={() => setShowOutputMonitor(true)}
        onOpenHotkeys={() => setShowHotkeys(true)}
        onToggleOutput={toggleDevProjectorWindow}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
      />

      {/* ===== MAIN WORKSPACE =====
           The song editor used to be an overlay ON TOP of this console, so
           every keystroke re-rendered AND repainted the sidebar, the slide
           grid (51 tiles x renderLyricsLayout) and the live panel behind the
           panel — that was the lag. It is the page in this slot now: while it
           is open the console subtree is not mounted at all, so an edit only
           renders the editor. */}
      <SongEditorModal />
      </>
      ) : (
      <>
      {/* ===== TOP HEADER (full width) ===== */}
      <TopHeader
        C={C}
        PINK={PINK}
        ACCENT={ACCENT}
        dockTab={dockTab}
        showName={activeService?.name || ''}
        showDate={activeService?.date || ''}
        activeCue={activeCue}
        activeLabel={activeCue?.label || ''}
        slideIndex={activeSlideIndex}
        slideCount={slideGrid.length}
        projectorOn={projectorOn}
        outputDisplays={outputDisplays}
        selectedOutputDisplay={outputs.find(o => o.id === 'projector')?.displayId ?? null}
        selectOutputDisplay={selectOutputDisplay}
        onOpenOutputs={() => setShowOutputMonitor(true)}
        onOpenHotkeys={() => setShowHotkeys(true)}
        onToggleOutput={toggleDevProjectorWindow}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
      />

      {/* THREE-AREA CONSOLE: persistent navigation · workspace · live output */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, width: '100%' }}>

{/* LEFT SIDEBAR */}
        <WorkspaceBoundary area="navigation" resetKey={dockTab}>
          <LeftSidebar />
        </WorkspaceBoundary>

        {/* CENTER WORKSPACE: SCRIPTURE BROWSER / SLIDE GRID / LAUNCHPAD */}
        <WorkspaceBoundary area="workspace" resetKey={dockTab}>
          <CenterWorkspace />
        </WorkspaceBoundary>

        {/* RIGHT SIDEBAR: OUTPUT MONITOR + CONTROLS. On the Countdown tab
            it stays mounted but LOCKED (preview visible, firing controls
            disabled) — the countdown owns the wall there. */}
        {rightOpen && (
        <WorkspaceBoundary area="outputs" resetKey={dockTab}>
        <LiveOutputPanel
          locked={dockTab === 'countdown'}
          C={C}
          PINK={PINK}
          ACCENT={ACCENT}
          activeSlideIndex={activeSlideIndex}
          slideCount={slideGrid.length}
          renderOutputPreview={renderOutputPreview}
          drawStrokes={drawStrokes}
          addDrawStroke={addDrawStroke}
          undoDrawStroke={undoDrawStroke}
          clearDrawStrokes={clearDrawStrokes}
          activeCue={activeCue}
          fireCueLive={fireCueLive}
          clearLyrics={clearLyrics}
          handlePrevCue={handlePrevCue}
          handleNextCue={handleNextCue}
          rightTab={rightTab}
          setRightTab={setRightTab}
          groupLabels={groupLabels}
          activeSong={activeSong}
          slideTimer={slideTimer}
          songHasBackground={songHasBackground}
          scriptureBgLibrary={scriptureBgLibrary}
          bibleMedia={bibleMedia}
          scriptureDefault={scriptureDefault}
          scriptureDefaultOptions={scriptureDefaultOptions}
          assignScriptureDefault={assignScriptureDefault}
          selectBibleMediaLive={selectBibleMediaLive}
          importBibleMedia={importBibleMedia}
          setScripturePicker={setScripturePicker}
          dockTab={dockTab}
          bibleFmt={bibleFmt}
          setBibleFmt={setBibleFmtLive}
          fireBibleSelectionLive={fireBibleSelectionLive}
          bibleSelCount={bibleSelVerses.length}
          sermon={sermon}
          sermonShots={sermonShots}
          sermonGoto={sermonGoto}
          slideGrid={slideGrid}
          renderSlideFace={renderSlideFace}
          renderFrozenWallFace={renderFrozenWallFace}
          wallFrameAspect={wallFrameAspect}
          monitorContent={monitorContent}
          fireGridTile={fireGridTile}
          liveBible={liveBible}
          toggleLiveBibleWord={toggleLiveBibleWord}
          fireOverlay={fireOverlay}
          clearOverlay={clearOverlay}
          liveOverlay={liveOverlay}
          projectorOn={projectorOn}
          persistMediaFile={persistMediaFile}
          lyricLift={lyricLift}
          setLyricLift={setLyricLift}
        />
        </WorkspaceBoundary>
        )}
      </div>
      </>
      )}

      {/* CUSTOM SLIDE MODAL */}
      <AnimatePresence>
      {customSlideModal && (
        <CustomSlideModal
          C={C}
          ACCENT={ACCENT}
          newSlideData={newSlideData}
          setNewSlideData={setNewSlideData}
          editing={customSlideEditIdx != null}
          persistMedia={persistMediaFile}
          onCancel={closeCustomSlideEditor}
          onAdd={addCustomSlideToService}
        />
      )}
      </AnimatePresence>

      {/* MEDLEY BUILDER MODAL — link secondary songs' stanzas to an anchor.
          Saves convert the row (or back to a plain song when unlinked). */}
      <AnimatePresence>
      {medleyModal && (
        <MedleyModal
          anchor={medleyModal.anchor}
          existing={medleyModal.existing}
          onSave={saveMedley}
          onClose={() => setMedleyModal(null)}
          anchorArranged={medleyModal.anchorArranged}
        />
      )}
      </AnimatePresence>

      {/* SCRIPTURE MEDIA PICKER — folder of Bible art / library / upload →
          session override or the default attached to new scripture. */}
      <AnimatePresence>
      {scripturePicker && (
        <ScriptureMediaPicker
          mode={scripturePicker}
          onClose={() => setScripturePicker(null)}
          onPick={(src) => chooseScriptureMedia(src, scripturePicker === 'default')}
        />
      )}
      </AnimatePresence>

      {/* ARRANGEMENT MODAL — custom play order for one service song row.
          The library song is never touched; Go/arrows walk the saved order. */}
      <AnimatePresence>
      {arrangementModal && (
        <ArrangementModal
          songId={arrangementModal.songId}
          title={arrangementModal.title}
          existing={arrangementModal.existing}
          onSave={saveArrangement}
          onClose={() => setArrangementModal(null)}
          forAnchor={arrangementModal.forAnchor}
        />
      )}
      </AnimatePresence>

      {/* NEW SONG PROMPT — pick Manual Builder vs Smart Paste first. (The song
          editor itself is no longer a modal: it renders in the MAIN WORKSPACE
          slot above as the editor page whenever isEditorOpen.) */}
      <AnimatePresence>
        {newSongPromptOpen && !isEditorOpen && (
          <NewSongPrompt onChoose={startNewSong} onCancel={() => setNewSongPromptOpen(false)} />
        )}
      </AnimatePresence>
      {/* TOASTER — Untitled UI toast stack (portals to body, z-index 10050,
          so it always sits above the modals) */}
      <Toaster />
      {/* PRESENTATION / SERMON BUILDER MODAL */}
      <AnimatePresence>
      {isPresentationOpen && (
        <PresentationModal />
      )}
      </AnimatePresence>
      {/* NEW SHOW BUILDER MODAL */}
      <AnimatePresence>
      {showModalOpen && showBuilder && <ShowBuilderModal />}
      </AnimatePresence>

      {/* SAVE TEMPLATE NAME MODAL */}
      <AnimatePresence>
      {showTemplateNameModal && (
        <TemplateNameModal
          C={C}
          ACCENT={ACCENT}
          value={templateNameValue}
          setValue={setTemplateNameValue}
          onCancel={() => setShowTemplateNameModal(false)}
          onConfirm={confirmSaveTemplate}
        />
      )}
      </AnimatePresence>

      {/* KEYBOARD SHORTCUT GUIDE */}
      <AnimatePresence>
      {showHotkeys && <HotkeysModal C={C} ACCENT={ACCENT} onClose={() => setShowHotkeys(false)} />}
      </AnimatePresence>

      {/* SETTINGS DIALOG — opened from the sidebar's Settings entry. It is a
          workspace-level modal now, not a 264px sidebar page. */}
      <AnimatePresence>
      {showSettings && <SettingsModal C={C} onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      {/* LIVE OUTPUTS MONITOR */}
      <AnimatePresence>
      {showOutputMonitor && (
        <OutputsMonitorModal
          C={C}
          PINK={PINK}
          outputDisplays={outputDisplays}
          outputs={outputs}
          updateOutput={updateOutput}
          addOutput={addOutput}
          removeOutput={removeOutput}
          setOutputRunning={setOutputRunning}
          outputAspect={outputAspect}
          setOutputAspect={setOutputAspect}
          onClose={() => setShowOutputMonitor(false)}
        />
      )}
      </AnimatePresence>

      {/* WHERE IN THE SHOW? — scripture "Add to Playlist" destination. */}
      <AnimatePresence>
      {bibleQueueModal && (
        <ScriptureSectionModal
          C={C}
          ACCENT={ACCENT}
          reference={bibleQueueModal.reference}
          count={bibleQueueModal.count}
          sections={bibleQueueModal.sections}
          initialTitle={bibleQueueModal.initialTitle}
          onPick={confirmBibleQueue}
          onCancel={() => setBibleQueueModal(null)}
        />
      )}
      </AnimatePresence>

      {/* CONFIRM / ALERT DIALOG */}
      <AnimatePresence>
      {confirmDialog && (
        <ConfirmModal
          C={C}
          ACCENT={ACCENT}
          mode={confirmDialog.mode}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          extraLabel={confirmDialog.extraLabel}
          onExtra={() => resolveConfirmDialog('extra')}
          onConfirm={() => resolveConfirmDialog(true)}
          onCancel={() => resolveConfirmDialog(false)}
        />
      )}
      </AnimatePresence>

    </div>
    </AppProvider>
  );
}
