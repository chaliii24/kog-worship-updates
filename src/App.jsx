import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Plus, Search, Star, Clock, Folder, Download, Upload, Trash2, Edit3, Image as ImageIcon, Video, AlignLeft, AlignCenter, AlignRight, Sparkles, CheckSquare, Square, Wand2, Monitor, Calendar, ArrowUp, ArrowDown, FileText, SkipBack, SkipForward, Cpu, LayoutGrid, Link2, Save, Copy, ChevronUp, ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, HelpCircle, Network, Menu, Eye, EyeOff, Lock, Unlock, GripVertical, ChevronLeft, ChevronRight, Type, PenLine, BringToFront, SendToBack, CornerUpLeft, MonitorPlay, Zap } from 'lucide-react';
import logoImage from './assets/logo.png';
import { getTheme } from './lib/theme';
import { TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, FONT_OPTIONS, cssSpeed } from './lib/constants';
import { emphasisLine, applyCaseTransform, renderLyricsLayout, FONT_SIZE_MAX } from './lib/lyrics';
import { parseSongBlocks, splitCuesByLines } from '../electron/songParse.js';
import { LiveBadge, TileVideo } from './lib/perf';
import SplashScreen from './components/SplashScreen';
import WelcomeScreen from './components/WelcomeScreen';
import StageDisplay from './components/StageDisplay';
import ProjectorDisplay from './components/ProjectorDisplay';
import TopHeader from './components/TopHeader';
import BottomDock from './components/BottomDock';
import LiveOutputPanel from './components/LiveOutputPanel';
import LeftSidebar from './components/LeftSidebar';
import CenterWorkspace from './components/CenterWorkspace';
import SongEditorModal from './components/SongEditorModal';
import PresentationModal from './components/PresentationModal';
import PresentationSlide from './components/PresentationSlide';
import ShowBuilderModal from './components/ShowBuilderModal';
import CustomSlideModal from './components/modals/CustomSlideModal';
import TemplateNameModal from './components/modals/TemplateNameModal';
import HotkeysModal from './components/modals/HotkeysModal';
import AboutModal from './components/modals/AboutModal';
import OutputsMonitorModal from './components/modals/OutputsMonitorModal';
import ConfirmModal from './components/modals/ConfirmModal';
import { AppProvider } from './context/AppContext';

const DEFAULT_OUTPUTS = [
  { id: 'projector', name: 'Lyrics Projector', role: 'lyrics', displayId: null, enabled: false, resolution: 'native', aspect: '16:9' },
  { id: 'stage', name: 'Stage Monitor', role: 'stage', displayId: null, enabled: false, resolution: 'native', aspect: '16:9' }
];

export default function App() {
  const isOutputWindow = typeof window !== 'undefined' && (
    window.location.hash.includes('/output/') ||
    window.location.hash.includes('/projector') ||
    window.location.hash.includes('/stage')
  );
  const [isProjector, setIsProjector] = useState(false);
  const [isStage, setIsStage] = useState(false);
  const [isOutput, setIsOutput] = useState(false);
  const [outputRole, setOutputRole] = useState('lyrics');
  const [showSplash, setShowSplash] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSlide, setCurrentSlide] = useState({ title: "KOG Worship", text: "", style: {}, timestamp: Date.now() });

  const [activeTab, setActiveTab] = useState('library'); // 'library' or 'service'
  const [themeDark, setThemeDark] = useState(() => {
    // Read + apply synchronously so there's no dark flash on boot for
    // light-mode users; the effect below keeps it in sync afterwards.
    let dark = true;
    try {
      const saved = localStorage.getItem('kog-theme');
      if (saved) dark = saved === 'dark';
    } catch { /* keep default */ }
    try {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch { /* non-browser context */ }
    return dark;
  });
  useEffect(() => {
    try { localStorage.setItem('kog-theme', themeDark ? 'dark' : 'light'); } catch { /* ignore */ }
    document.documentElement.dataset.theme = themeDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = themeDark ? 'dark' : 'light';
  }, [themeDark]);
  // Cross-fade the flip: .theme-fading (index.css) enables a short
  // background/border/color transition on every element, but ONLY while a
  // toggle is in flight — zero transition overhead any other time. The
  // double rAF guarantees the browser paints the transition-enabled style
  // with the OLD colors first, so the recolor actually animates instead of
  // snapping (class + value change in one recalc = no transition).
  const themeFadeTimerRef = useRef(null);
  const toggleTheme = () => {
    const root = document.documentElement;
    if (themeFadeTimerRef.current) { clearTimeout(themeFadeTimerRef.current); themeFadeTimerRef.current = null; }
    root.classList.add('theme-fading');
    requestAnimationFrame(() => requestAnimationFrame(() => {
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
  const [activeSong, setActiveSong] = useState(null);
  const [activeCue, setActiveCue] = useState(null);

  // Panel Collapse State
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [aboutStatus, setAboutStatus] = useState('');
  const [updateReady, setUpdateReady] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [showOutputMonitor, setShowOutputMonitor] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // In-app confirm/alert dialog (replaces native confirm/alert, which steal focus in Electron)
  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmResolverRef = useRef(null);

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

  // New Command-Center Layout State
  const [dockTab, setDockTab] = useState('shows'); // shows | media | audio | templates | scripture | functions
  const [scheduleView, setScheduleView] = useState('schedule'); // 'schedule' | 'songs'
  const [activeMenu, setActiveMenu] = useState(null); // 'file' | 'edit' | 'view' | 'help'
  const [rightTab, setRightTab] = useState('groups'); // 'groups' | 'media'

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
  const [bibleTestament, setBibleTestament] = useState('all'); // all | ot | nt
  const [bibleBookQuery, setBibleBookQuery] = useState('');
  const [bibleRef, setBibleRef] = useState('');
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState(null);
  const [bibleSelVerses, setBibleSelVerses] = useState([]); // verse numbers highlighted in current chapter
  const [bibleFocusedVerse, setBibleFocusedVerse] = useState(null); // verse number with keyboard focus for arrow nav
  const [bibleFmt, setBibleFmt] = useState({ bold: false, caps: false, layout: 'number' }); // number | plain | sentence
  const bibleLastVerseRef = useRef(null); // anchor verse for Shift+Click range selection

  // New Show builder + per-slide live timer
  const [showModalOpen, setShowModalOpen] = useState(false);
  const [showBuilder, setShowBuilder] = useState(null);
  const [builderSongQuery, setBuilderSongQuery] = useState({});
  const [builderSrcSongQuery, setBuilderSrcSongQuery] = useState('');
  const [builderSheet, setBuilderSheet] = useState(null); // { secIdx, itemIdx } of selected service-order item
  const [builderTargetSecId, setBuilderTargetSecId] = useState(null); // section that Add Song/Slide/Media goes into
  const [builderDensity, setBuilderDensity] = useState(3); // 1-4 grid density
  const [builderTileIdx, setBuilderTileIdx] = useState(0); // active tile within selected item
  const [builderCollapsed, setBuilderCollapsed] = useState([]);
  const [builderRehearse, setBuilderRehearse] = useState(false);
  const [builderActiveSong, setBuilderActiveSong] = useState(null);
  const [builderSongDetails, setBuilderSongDetails] = useState({});
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [slideTimer, setSlideTimer] = useState({ start: null, elapsed: 0, duration: 0 });

  // Service Plan State
  const [services, setServices] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [showTemplateNameModal, setShowTemplateNameModal] = useState(false);
  const [templateNameValue, setTemplateNameValue] = useState('');
  const [activeService, setActiveService] = useState({ id: null, name: 'Sunday Service', date: new Date().toISOString().split('T')[0], items: [] });
  const [customSlideModal, setCustomSlideModal] = useState(false);
  const [newSlideData, setNewSlideData] = useState({ title: 'Welcome / Announcements', subtitle: 'Service Slide', content: '' });

  // Sermon / Presentation builder state
  const [presentations, setPresentations] = useState([]);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [activePresentation, setActivePresentation] = useState(null); // { deck, index }
  const presentationNextRef = useRef(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('manual');
  const [rawPasteText, setRawPasteText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importUrlStatus, setImportUrlStatus] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [editingSong, setEditingSong] = useState({ id: null, title: '', artist: '', category: 'Worship', cues: [] });
  const [linesPerSlide, setLinesPerSlide] = useState(4);

  // G-Presenter style editor state
  const [editorCueIdx, setEditorCueIdx] = useState(0);
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
  const outputAspect = outputAspectState;
  const setOutputAspect = (v) => {
    setOutputAspectState(v);
    try { localStorage.setItem('kog_output_aspect', v); } catch {}
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-output-aspect', v);
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
  const [selectedAiModel, setSelectedAiModel] = useState('gemini-1.5-flash'); // 'gemini-1.5-flash', 'gemini-1.5-pro', or 'ollama'
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
  const lastBibleRef = useRef(null);
  const liveBibleRef = useRef(null);
  const liveBibleSrcRef = useRef(null);

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

  // Restore the saved output layout on startup.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('outputs-load')
      .then((saved) => { if (Array.isArray(saved) && saved.length) setOutputs(saved.map(o => ({ ...o, resolution: o.resolution || 'native', aspect: o.aspect || '16:9', enabled: false }))); })
      .catch(() => {})
      .finally(() => { outputsReadyRef.current = true; });
  }, []);

  // Keep main's window registry in sync with the output configuration.
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('outputs-sync', outputs);
    if (outputsReadyRef.current) ipcRenderer.send('outputs-save', outputs);
  }, [outputs]);

  // Sync projector output's aspect to global state so output windows receive it
  useEffect(() => {
    if (isOutputWindow || !window.require) return;
    const projector = outputs.find(o => o.id === 'projector');
    if (projector && projector.aspect && projector.aspect !== outputAspect) {
      setOutputAspect(projector.aspect);
    }
  }, [outputs]);

  const fetchSongs = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-songs', searchQuery, activeCategory);
      setSongs(result);
    }
  };

  const fetchServices = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-services');
      setServices(result);
    }
  };

  const fetchMediaLibrary = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('db-get-media');
      setMediaLibrary(result || []);
    }
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
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-presentation', id);
    await fetchPresentations();
  };

  const applyTemplate = async (templateId) => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
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

  const selectSong = async (id) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-song-details', id);
      setActiveSong(details);
    }
  };

  const editSong = async (id) => {
    let song = null;
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      song = await ipcRenderer.invoke('db-get-song-details', id);
    }
    if (!song) return;
    setEditingSong({ ...song, cues: song.cues || [] });
    setEditorMode('manual');
    setRawPasteText('');
    setIsEditorOpen(true);
  };

  useEffect(() => {
    const hash = window.location.hash;
    const outputMatch = hash.match(/#\/output\/([^?]+)(?:\?role=([^&]+))?/);
    if (hash.includes('/stage')) {
      setIsStage(true);
      setIsProjector(false);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-stage', (event, stageData) => {
          setCurrentSlide(stageData);
        });
      }
    } else if (outputMatch) {
      setIsOutput(true);
      setOutputRole(decodeURIComponent(outputMatch[2] || 'lyrics'));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-slide', (event, slideData) => {
          setCurrentSlide(slideData);
        });
        ipcRenderer.on('render-live-stage', (event, stageData) => {
          setCurrentSlide(stageData);
        });
      }
    } else if (hash.includes('/projector')) {
      setIsProjector(true);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('render-live-slide', (event, slideData) => {
          setCurrentSlide(slideData);
        });
      }
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
    const onUpdateAvailable = (event, info) => { setAboutStatus(`Update available: v${info.version}`); setUpdateReady('available'); setUpdateProgress(null); };
    const onUpdateDownloaded = (event, info) => { setAboutStatus(`Update downloaded: v${info.version}. Restart to install.`); setUpdateReady('downloaded'); setUpdateProgress(null); };
    const onUpdateError = (event, error) => { setAboutStatus(`Update error: ${error}`); setUpdateReady(null); setUpdateProgress(null); };
    const onUpdateNotAvailable = (event, info) => { setAboutStatus(`App is up to date.`); setUpdateReady(null); setUpdateProgress(null); };
    const onDownloadProgress = (event, progress) => { setUpdateProgress(progress); setAboutStatus(`Downloading... ${Math.round(progress.percent)}%`); };
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
    const t = setTimeout(fetchSongs, 180);
    return () => clearTimeout(t);
  }, [searchQuery]);

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
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dockTab === 'media' || dockTab === 'audio') fetchMediaLibrary();
    if (dockTab === 'functions') { fetchLibraryStats(); fetchAppInfo(); }
  }, [dockTab]);

  useEffect(() => {
    try { localStorage.setItem('bibleMedia', JSON.stringify(bibleMedia)); } catch {}
  }, [bibleMedia]);

  useEffect(() => {
    if (bibleMediaOpen) fetchMediaLibrary();
  }, [bibleMediaOpen]);

  const selectBibleMedia = (type, value, name) => applyScriptureBg(type && value ? { type, value, name } : null);

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

  // --- KEYBOARD SHORTCUTS ---
  const handleNextCue = useCallback(() => {
    if (activePresentation) { presentationNextRef.current && presentationNextRef.current(1); return; }
    if (!activeSong?.cues) return;
    const currentIndex = activeSong.cues.findIndex(c => c.id === activeCue?.id);
    if (currentIndex < activeSong.cues.length - 1) {
      fireCueLive(activeSong.cues[currentIndex + 1]);
    }
  }, [activeSong, activeCue, activePresentation]);

  const handlePrevCue = useCallback(() => {
    if (activePresentation) { presentationNextRef.current && presentationNextRef.current(-1); return; }
    if (!activeSong?.cues) return;
    const currentIndex = activeSong.cues.findIndex(c => c.id === activeCue?.id);
    if (currentIndex > 0) {
      fireCueLive(activeSong.cues[currentIndex - 1]);
    } else if (currentIndex === 0 || activeCue?.id === 'title-card') {
      fireTitleLive();
    }
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
      // Don't handle arrow keys for slide grid when in scripture verse viewer
      if (dockTab === 'scripture' && bibleStep === 'verses') return;
      if (showModalOpen) {
        if (showBuilder && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); builderAdvance(1); }
        if (showBuilder && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); builderAdvance(-1); }
        return;
      }
      if (e.key === 'b' || e.key === 'B') fireCueLive({ id: 'clear', label: 'Clear', text: '' });
      if (e.key === ' ') { e.preventDefault(); handleNextCue(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNextCue(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevCue(); }
      if (e.key === '?') { e.preventDefault(); setShowHotkeys(v => !v); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextCue, handlePrevCue, showModalOpen, showBuilder, builderSheet, builderTileIdx, dockTab, bibleStep, isEditorOpen]);

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

// --- STAGE DISPLAY FEED ---
  const sendStageData = (currentPayload, nextPayload) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-stage', {
        current: {
          title: currentPayload.title || '',
          label: currentPayload.label || '',
          text: currentPayload.text || '',
          timestamp: currentPayload.timestamp || Date.now()
        },
        next: nextPayload ? { title: nextPayload.title, label: nextPayload.label, text: nextPayload.text } : null,
        timestamp: Date.now()
      });
    }
  };

  const isPlainBg = (bg_type, bg_value) => (bg_type == null || bg_type === 'color') && (!bg_value || bg_value.toLowerCase() === '#000000');

  const cueHasBackground = (cue) => cue && !isPlainBg(cue.bg_type, cue.bg_value);

  const songHasBackground = (song) => song && !isPlainBg(song.bg_type, song.bg_value);

  const songBackgroundStyle = () => {
    if (songHasBackground(activeSong)) {
      return { ...stageStyle, backgroundType: activeSong.bg_type || 'color', backgroundValue: activeSong.bg_value || '#000000' };
    }
    return stageStyle;
  };

  const resolutionStyle = (cue) => {
    const base = cueHasBackground(cue)
      ? { ...stageStyle, backgroundType: cue.bg_type || 'color', backgroundValue: cue.bg_value || '#000000' }
      : songBackgroundStyle();
    if (cue && cue.id !== 'clear') {
      return {
        ...base,
        lyric: cueLyricStyle(cue),
        transition: cue.anim || 'none',
        speed: cssSpeed(cue.speed),
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
          items.push({ item_type: 'custom_slide', title: it.title || 'Slide', subtitle: sec.title, content: it.content || '', duration: Number(it.duration) || 0 });
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

  const selectBuilderItem = async (secIdx, itemIdx) => {
    setBuilderSheet({ secIdx, itemIdx });
    setBuilderTileIdx(0);
    const item = showBuilder?.sections?.[secIdx]?.items?.[itemIdx];
    if (item?.songId && window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-song-details', item.songId);
      setBuilderActiveSong(details);
      if (details) setBuilderSongDetails(prev => ({ ...prev, [item.songId]: details }));
    } else {
      setBuilderActiveSong(null);
    }
  };

  useEffect(() => {
    if (!showModalOpen || !window.require) return;
    const songIds = [...new Set((showBuilder?.sections || []).flatMap(s => s.items.filter(i => i.songId).map(i => i.songId)))];
    if (songIds.length === 0) return;
    (async () => {
      const { ipcRenderer } = window.require('electron');
      const detailsArr = await Promise.all(songIds.map(id => ipcRenderer.invoke('db-get-song-details', id)));
      const map = {};
      detailsArr.forEach((d, i) => { if (d) map[songIds[i]] = d; });
      setBuilderSongDetails(prev => ({ ...prev, ...map }));
    })();
  }, [showModalOpen, showBuilder]);

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
        const titleCue = song.title_cue || { id: 'title-card', label: 'Song Title', text: song.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: 110, align: 'center', color: '#ffffff' };
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
          style: { ...stageStyle, ...titleBg, lyric: cueLyricStyle(titleCue), transition: titleCue.anim || 'fade', speed: cssSpeed(titleCue.speed) },
          audio: song.audio_url || null,
          timestamp: Date.now()
        };
        setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
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
          return { ...base, lyric: cueLyricStyle(cue), transition: cue.anim || 'none', speed: cssSpeed(cue.speed) };
        })();
        const slidePayload = { title: song.title, artist: song.artist || '', text: cue.text, label: cue.label || '', style: effectiveStyle, audio: song.audio_url || null, timestamp: Date.now() };
        setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
        if (window.require && targetedDisplays.includes(1)) { window.require('electron').ipcRenderer.send('update-live-slide', slidePayload); }
        const cueList = song.cues || [];
        const idx = cueList.findIndex(c => c.id === cue.id);
        const nextCue = idx > -1 ? cueList[idx + 1] : cueList[0];
        sendStageData({ title: song.title, label: cue.label || '', text: cue.text, timestamp: slidePayload.timestamp }, nextCue ? { title: song.title, label: nextCue.label, text: nextCue.text } : null);
      }
    } else if (item.media_url) {
      fireServiceItemLive({ id: 'b-' + Date.now(), item_type: 'media', title: item.title, subtitle: entry.sec.title, content: '', media_type: item.media_type, media_url: item.media_url, duration: item.duration || 0 });
    } else {
      fireServiceItemLive({ id: 'b-' + Date.now(), item_type: 'custom_slide', title: item.title, subtitle: entry.sec.title, content: item.content || '', duration: item.duration || 0 });
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

  const addShowBuilderMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await persistMediaFile(file);
    if (!url) { await appAlert('Could not copy that media file. Try another image or video.'); if (e.target) e.target.value = ''; return; }
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const secId = builderTargetSectionId;
    if (secId) {
      setShowBuilder(prev => ({
        ...prev,
        sections: prev.sections.map(s => s.id === secId ? { ...s, items: [...s.items, { title: file.name.replace(/\.[^.]+$/, ''), content: '', duration: 0, media_type: kind, media_url: url }] } : s)
      }));
    } else {
      await appAlert('Add a section first, then try again.');
    }
    if (e.target) e.target.value = '';
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

  const fireCueLive = (cue) => {
    liveBibleRef.current = null;
    liveBibleSrcRef.current = null;
    setActiveCue(cue);
    if (cue?.id === 'clear') {
      setSlideTimer({ start: null, elapsed: 0, duration: 0 });
    } else {
      const d = Number(cue?.duration) || 0;
      setSlideTimer({ start: Date.now(), elapsed: 0, duration: d });
    }
    const effectiveStyle = resolutionStyle(cue);
    const slidePayload = { 
      title: activeSong?.title || '', 
      artist: activeSong?.artist || '',
      text: cue && cue.id !== 'clear' ? cue.text : '',
      label: cue?.label || '',
      style: effectiveStyle,
      audio: activeSong?.audio_url || null,
      timestamp: Date.now() 
    };
    setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    // Stage feed: current + next cue
    const cueList = activeSong?.cues || [];
    const idx = cue?.id ? cueList.findIndex(c => c.id === cue.id) : -1;
    const nextCue = idx > -1 ? cueList[idx + 1] : (cueList.length > 0 ? cueList[0] : null);
    sendStageData(
      { title: slidePayload.title, label: cue?.label || 'Song Title', text: cue?.id === 'clear' ? '' : slidePayload.text, timestamp: slidePayload.timestamp },
      nextCue ? { title: activeSong?.title, label: nextCue.label, text: nextCue.text } : null
    );
  };

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
      timestamp: Date.now(),
    };
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
  }, [activeCue, activeSong, targetedDisplays, displays, resolutionStyle]);

  const fireTitleLive = () => {
    if (!activeSong) return;
    liveBibleRef.current = null;
    liveBibleSrcRef.current = null;
    const titleCue = activeSong.title_cue || { id: 'title-card', label: 'Song Title', text: activeSong.title, box: { x: 80, y: 140, w: 1120, h: 440 }, size: 110, align: 'center', color: '#ffffff' };
    setActiveCue(titleCue);
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    const effectiveStyle = resolutionStyle(titleCue);
    const slidePayload = { 
      title: activeSong.artist || '', 
      artist: activeSong.artist || '',
      text: titleCue.text || activeSong.title,
      label: 'Song Title',
      style: effectiveStyle,
      audio: activeSong.audio_url || null,
      timestamp: Date.now() 
    };
    setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    const nextCue = activeSong.cues && activeSong.cues.length > 0 ? activeSong.cues[0] : null;
    sendStageData(
      { title: slidePayload.title, label: 'Song Title', text: activeSong.title, timestamp: slidePayload.timestamp },
      nextCue ? { title: activeSong.title, label: nextCue.label, text: nextCue.text } : null
    );
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
      timestamp: Date.now()
    };
    setActiveCue({ id: sourceId || ('pres-' + (deck.id || 'unsaved')), label: deck.title, text: '' });
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (window.require && targetedDisplays.includes(1)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    sendStageData({ title: deck.title, label: slidePayload.label, text: s.notes || '', timestamp: slidePayload.timestamp }, null);
  };

  const presentDeck = (deck) => firePresentationSlide(deck, 0);

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

  const fireServiceItemLive = (item) => {
    liveBibleRef.current = (item.meta && item.meta.kind === 'bible') ? item : null;
    liveBibleSrcRef.current = (item.meta && item.meta.kind === 'bible') ? (item.meta.source || null) : null;
    if (item.item_type === 'song') {
      selectSong(item.content); 
    } else if (item.item_type === 'media') {
      if (activeCue?.id === item.id) return;
      fireServiceMediaLive(item);
    } else if (item.item_type === 'presentation') {
      firePresentationFromItem(item);
    } else {
      if (item.meta && item.meta.kind === 'bible') lastBibleRef.current = item;
      setActiveCue({ id: item.id, label: item.subtitle, text: item.content });
      const d = Number(item.duration) || 0;
      setSlideTimer({ start: Date.now(), elapsed: 0, duration: d });
      const slidePayload = { title: item.title, text: item.content, label: item.subtitle, style: item.style || stageStyle, audio: activeSong?.audio_url || null, meta: item.meta || null, timestamp: Date.now() };
      setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
      if (window.require && targetedDisplays.includes(1)) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('update-live-slide', slidePayload);
      }
      sendStageData({ title: item.title, label: item.subtitle, text: item.content, timestamp: slidePayload.timestamp }, null);
    }
  };

  const normalizeDisplay = (displayId) => {
    if (displayId === null || displayId === undefined || displayId === '') return null;
    if (displayId === 'preview') return 'preview';
    return Number(displayId);
  };

  const updateOutput = (id, patch) => {
    setOutputs(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
  };

  const addOutput = () => {
    setOutputs(prev => {
      const id = `out-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev, { id, name: `Output ${prev.length + 1}`, role: 'lyrics', displayId: null, enabled: false, resolution: 'native', aspect: '16:9' }];
    });
  };

  const removeOutput = (id) => {
    setOutputs(prev => prev.filter(o => o.id !== id));
  };

  const firstDisplayId = () => (outputDisplays && outputDisplays.length ? outputDisplays[0].id : 'preview');

  // Outputs never auto-open on launch: `enabled` is runtime-only (stripped when
  // saved) and starts false, so the operator must explicitly start each output.
  const setOutputRunning = (id, running) => {
    setOutputs(prev => prev.map(o => (o.id === id
      ? { ...o, enabled: !!running, displayId: running && !o.displayId ? firstDisplayId() : o.displayId }
      : o)));
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
  // (or append when no target / target missing).
  const insertServiceItem = (newItem) => {
    setActiveService(prev => {
      const items = [...(prev?.items || [])];
      const target = serviceTargetTitle;
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
    const items = [...(activeService?.items || [])];
    if (!items[idx] || items[idx].item_type !== 'section_header') return;
    const oldTitle = items[idx].title;
    const nextTitle = title || 'Section';
    items[idx] = { ...items[idx], title: nextTitle };
    setActiveService(prev => ({ ...prev, items }));
    if (oldTitle !== nextTitle) {
      setServiceCollapsed(prev => prev.map(t => (t === oldTitle ? nextTitle : t)));
    }
  };

  const addCustomSlideToService = () => {
    const newItem = { item_type: 'custom_slide', title: newSlideData.title, subtitle: newSlideData.subtitle, content: newSlideData.content };
    insertServiceItem(newItem);
    setCustomSlideModal(false);
    setNewSlideData({ title: 'Welcome / Announcements', subtitle: 'Service Slide', content: '' });
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
    const items = [...activeService.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    setActiveService({ ...activeService, items });
    setDragIndex(null);
  };

  const moveServiceBlock = (fromIdx, toIdx) => {
    const items = [...(activeService?.items || [])];
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx >= items.length) return;
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
    setActiveService({ ...activeService, items: result });
    setDragIndex(null);
  };

  const moveServiceItem = (index, direction) => {
    const newItems = [...activeService.items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setActiveService({ ...activeService, items: newItems });
  };

  const removeServiceItem = (index) => {
    const newItems = activeService.items.filter((_, i) => i !== index);
    setActiveService({ ...activeService, items: newItems });
  };

  // --- SERVICE ORDER (G-Presenter style) ---
  const serviceOrderCount = () => (activeService?.items || []).filter(i => i.item_type !== 'section_header').length;
  const serviceSlideCount = (item) => {
    if (item.item_type === 'song') {
      const song = songs.find(s => s.id === item.content);
      return song ? (song.cues || []).length : 0;
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
  const serviceItemIsLive = (item) => {
    if (item.item_type === 'song') return Number(item.content) === activeSong?.id;
    if (item.item_type === 'custom_slide') return activeCue?.id === item.id;
    if (item.item_type === 'media') return activeCue?.id === item.id;
    if (item.item_type === 'presentation') return activeCue?.id === item.id;
    return false;
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
    const slidePayload = { title: item.title, text: '', label: item.subtitle || 'Media', style: { ...stageStyle, backgroundType: bgType, backgroundValue: mediaUrl }, audio: activeSong?.audio_url || null, timestamp: Date.now() };
    setActiveCue({ id: item.id, label: item.subtitle || 'Media', text: '' });
    setSlideTimer({ start: Date.now(), elapsed: 0, duration: 0 });
    setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
    if (window.require && (targetedDisplays.includes(1) || true)) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('update-live-slide', slidePayload);
    }
    sendStageData({ title: item.title, label: item.subtitle || 'Media', text: '', timestamp: slidePayload.timestamp }, null);
  };

  const stopServiceItemLive = (item) => {
    if (!serviceItemIsLive(item)) return;
    if (item.item_type === 'song') {
      setActiveSong(null);
      setActiveCue({ id: 'clear', label: 'Clear', text: '' });
      setSlideTimer({ start: null, elapsed: 0, duration: 0 });
      const slidePayload = { title: '', artist: '', text: '', label: 'Clear', style: { ...stageStyle, backgroundType: 'color', backgroundValue: '#000000' }, audio: null, timestamp: Date.now() };
      setDisplays(displays.map(d => targetedDisplays.includes(d.id) ? { ...d, content: slidePayload } : d));
      if (window.require && targetedDisplays.includes(1)) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('update-live-slide', slidePayload);
      }
      sendStageData({ title: '', label: 'Clear', text: '', timestamp: slidePayload.timestamp }, null);
      return;
    }
    fireCueLive({ id: 'clear', label: 'Clear', text: '' });
  };

  const saveCurrentService = async () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const savedId = await ipcRenderer.invoke('db-save-service', activeService);
      setActiveService({ ...activeService, id: savedId });
      fetchServices();
      await appAlert('Service plan saved successfully!');
    }
  };

  const loadService = async (serviceId) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-service-details', serviceId);
      if (details) setActiveService(details);
    }
  };

  // Step 5 (FreeShow flow): queue a saved show into the active Service Plan
  const queueShowIntoService = async (showId, insertAtEnd = true) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const details = await ipcRenderer.invoke('db-get-service-details', showId);
      if (!details) return;
      const target = activeService?.items || [];
      const toAdd = [...(target.length ? [{ item_type: 'section_header', title: details.name, subtitle: 'Show', content: '', duration: 0 }] : []), ...(details.items || [])];
      setActiveService({ ...(activeService || { id: null, name: '', date: '' }), items: insertAtEnd ? [...target, ...toAdd] : [...toAdd, ...target] });
    }
  };

  // --- HYBRID AI / FALLBACK SMART AUTO-PASTE PARSER ---
  // Works for chord charts AND plain lyrics — with or without section
  // markers. The AI gets first shot; whatever comes back (AI, IPC failsafe
  // or the local fallback) is normalised and split to linesPerSlide through
  // the shared parser in electron/songParse.js, so a lyrics-site paste with
  // no [Verse]/Chorus labels still builds real blocks.
  const processAutoPaste = async (textOverride) => {
    const text = (typeof textOverride === 'string') ? textOverride : rawPasteText;
    if (!text || !text.trim()) {
      await appAlert("Please paste lyrics or a chord chart first!");
      return;
    }

    if (selectedAiModel === 'ollama' && text.length > 5000) {
      await appAlert("Text is too long for local Ollama! Please trim your text or switch to Gemini 3.6 Flash.");
      return;
    }

    setIsParsing(true);
    try {
      let cues = null;
      try {
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          const result = await ipcRenderer.invoke('ai-parse-chord-chart', { text, model: selectedAiModel, linesPerSlide });
          if (result && Array.isArray(result.cues) && result.cues.length > 0) {
            cues = splitCuesByLines(result.cues, linesPerSlide);
            setAiStatus(result.modelUsed);
          }
        }
      } catch (err) {
        console.log('AI Parser IPC failed, falling back to the local parser...', err);
      }

      // No AI/IPC result? Build the blocks locally — same parser the main
      // process uses, so pure lyrics behave identically offline.
      if (!cues || cues.length === 0) {
        cues = splitCuesByLines(parseSongBlocks(text, linesPerSlide), linesPerSlide);
        setAiStatus('Local Parser (Offline)');
      }
      if (cues.length === 0) cues = [{ label: 'Verse 1', text }];

      setEditingSong(prev => ({ ...prev, cues }));
      return cues;
    } finally {
      setIsParsing(false);
    }
  };

  // ----------------------------------------------------

  // --- WEB SONG IMPORT: fetch chord chart/lyrics from a URL then parse ---
  const fetchSongFromUrl = async () => {
    if (!importUrl.trim()) { await appAlert('Paste a song URL first — lyric sites and chord charts both work.'); return; }
    setImportUrlStatus('Fetching page…');
    setIsFetching(true);
    try {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('fetch-song-url', importUrl.trim());
      if (result && result.error) { setImportUrlStatus(result.error); return; }
      if (result && result.text && result.text.trim()) {
        const srcLabel = result.source ? ` (${result.source})` : '';
        const titleLabel = result.title ? ` — “${result.title}”` : '';
        if (result.title) {
          setEditingSong(prev => (prev.title && prev.title.trim()) ? prev : { ...prev, title: result.title });
        }
        setRawPasteText(result.text);
        setImportUrlStatus(`Fetched ${result.text.length} chars${srcLabel}${titleLabel} — parsing…`);
        const cues = await processAutoPaste(result.text);
        setImportUrlStatus(`Imported & parsed ✓ (${(cues || []).length} blocks)${srcLabel}${titleLabel}`);
      } else {
        setImportUrlStatus('No readable text found.');
      }
    } catch (err) {
      setImportUrlStatus('Fetch failed: ' + err.message);
    } finally {
      setIsFetching(false);
    }
  };

  const moveCue = (idx, dir) => {
    const newCues = [...editingSong.cues];
    const target = idx + dir;
    if (target < 0 || target >= newCues.length) return;
    const tmp = newCues[idx];
    newCues[idx] = newCues[target];
    newCues[target] = tmp;
    setEditingSong({ ...editingSong, cues: newCues });
  };

  const duplicateCue = (idx) => {
    if (idx == null || idx < 0) return;
    const newCues = [...editingSong.cues];
    const copy = { ...newCues[idx] };
    delete copy.id;
    newCues.splice(idx + 1, 0, copy);
    setEditingSong({ ...editingSong, cues: newCues });
  };

  const setCueBackground = (idx, bgType, bgValue) => {
    if (idx === -1) { updateCue(-1, { bg_type: bgType, bg_value: bgValue }); return; }
    const newCues = [...editingSong.cues];
    newCues[idx] = { ...newCues[idx], bg_type: bgType, bg_value: bgValue };
    setEditingSong({ ...editingSong, cues: newCues });
  };

  const cueFileToBackground = async (idx, type, file) => {
    if (file) {
      const url = await persistMediaFile(file);
      setCueBackground(idx, type, url || URL.createObjectURL(file));
    }
  };

  const setSongBackground = (bgType, bgValue) => setEditingSong({ ...editingSong, bg_type: bgType, bg_value: bgValue });

  const songBgFileToBackground = async (type, file) => {
    if (file) {
      const url = await persistMediaFile(file);
      setSongBackground(type, url || URL.createObjectURL(file));
    }
  };

  const clearCueBackground = (idx) => setCueBackground(idx, 'color', '#000000');

  // Split every section into slides of N lines each
  const splitCuesToLines = () => {
    const n = Math.max(1, Math.floor(Number(linesPerSlide) || 4));
    const partLabel = (label) => (label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim() || 'Verse 1';
    const newCues = [];
    editingSong.cues.forEach((cue) => {
      const baseLabel = partLabel(cue.label);
      const lines = (cue.text || '').split('\n').filter(l => l.trim() !== '');
      if (lines.length === 0 || lines.length <= n) {
        newCues.push({ ...cue, label: baseLabel });
        return;
      }
      for (let i = 0; i < lines.length; i += n) {
        const part = Math.floor(i / n) + 1;
        newCues.push({ ...cue, label: `${baseLabel} (Part ${part})`, text: lines.slice(i, i + n).join('\n') });
      }
    });
    setEditingSong({ ...editingSong, cues: newCues });
  };

  // ---- G-PRESENTER STYLE EDITOR HELPERS ----
  const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480 };
  const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const defaultTitleCue = {
    id: 'title-card',
    label: 'Song Title',
    text: editingSong?.title || '',
    box: { x: 80, y: 140, w: 1120, h: 440 },
    size: 110,
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
  const cueThrottleRef = useRef({ timer: null, idx: null, patch: null });
  const updateCueThrottled = (idx, patch) => {
    const q = cueThrottleRef.current;
    q.idx = idx; q.patch = patch;
    if (q.timer) return;
    updateCue(idx, patch);
    q.timer = setTimeout(() => { q.timer = null; if (q.idx != null) updateCue(q.idx, q.patch); }, 120);
  };

  // One click: merge a patch into every slide (title slide included).
  const applyPatchToAllCues = (patch) => {
    if (!patch) return;
    setEditingSong(prev => ({
      ...prev,
      title_cue: { ...(prev.title_cue || { ...defaultTitleCue, text: prev.title || defaultTitleCue.text }), ...patch },
      cues: (prev.cues || []).map(c => ({ ...c, ...patch })),
    }));
  };

  // One click: apply the current font to every slide (title slide included).
  const applyFontToAllCues = (font) => {
    if (font) applyPatchToAllCues({ font });
  };

  const baseGroupLabel = (label = '') => label.replace(/\s*\(Part\s+\d+\)\s*$/i, '').replace(/[a-z]$/i, '') || 'Slides';

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
    const cues = editingSong.cues || [];
    const cur = cues[editorCueIdx] || {};
    const labels = cues.map(c => c.label);
    const base = baseGroupLabel(cur.label);
    const letter = nextSuffixLetter(labels, base);
    const newCues = [...cues];
    newCues[editorCueIdx] = { ...cur, text: before };
    newCues.splice(editorCueIdx + 1, 0, { ...cur, label: `${base}${letter}`, text: after, id: undefined, locked: false, box: cur.box || DEFAULT_BOX });
    setEditingSong({ ...editingSong, cues: newCues });
    setEditorCueIdx(editorCueIdx + 1);
    setTimeout(() => setCanvasEdit(true), 0);
  };

  const applyAlignToAll = () => {
    const align = editorCue?.align || 'center';
    setEditingSong(s => ({ ...s, cues: (s.cues || []).map(c => ({ ...c, align })) }));
  };

  const applyAnimToAll = () => {
    const src = editorCue || {};
    setEditingSong(s => ({ ...s, cues: (s.cues || []).map(c => ({ ...c, anim: src.anim || c.anim, speed: src.speed != null ? src.speed : c.speed, autoNext: src.autoNext != null ? src.autoNext : c.autoNext })) }));
  };

  const reorderCues = (from, to) => {
    if (from == null || to == null || from === to) return;
    const arr = [...(editingSong.cues || [])];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setEditingSong({ ...editingSong, cues: arr });
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
      const origSize = Number(editorCue.size) || 110;
      const ratio = origSize / origH;
      patch.size = Math.round(clampNum(nh * ratio, 18, FONT_SIZE_MAX));
    }
    updateCue(editorCueIdx, patch);
  };

  const endBoxDrag = () => setBoxDrag(null);

  const ToolbarBtn = ({ children, danger, active, title, onClick }) => (
    <button title={title} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: active ? 'rgba(34,197,94,0.15)' : C.elevated, border: '1px solid ' + (active ? 'rgba(34,197,94,0.5)' : 'var(--ui-border2)'), color: danger ? '#f87171' : C.text2, borderRadius: 7, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{children}</button>
  );

  const fitStageFont = (text) => {
    const lines = (text || '').split('\n');
    const lh = editorCue?.lineHeight || 1.05;
    const boxW = Math.max(200, (editorBox.w || 800) - 40);
    const boxH = editorBox.h || 340;
    const baseSize = Math.max(18, Math.min(Number(editorCue?.size) || 110, FONT_SIZE_MAX));
    const scaleFor = (isEmph) => (isEmph ? 1.24 : 0.84);
    const caps = lines.filter(l => l.trim().length > 1 && l.trim() === l.trim().toUpperCase());
    const key = caps.length ? caps[0] : (lines.slice().sort((a, b) => b.trim().length - a.trim().length)[0] || '');
    const totalHeight = (base) => lines.reduce((h, l) => {
      if (!l.trim()) return h + base * lh * 0.7;
      const f = base * scaleFor(l.trim() === key);
      const cpl = Math.max(6, boxW / (f * 0.55));
      const wrapped = Math.max(1, Math.ceil(l.length / cpl));
      return h + wrapped * f * lh;
    }, 0);
    let fs = baseSize;
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual) break;
      fs = Math.max(14, Math.min(baseSize, fs * ((boxH * 0.92) / actual)));
    }
    return Math.round(fs);
  };

  const cueLyricStyle = (cue) => ({
    font: cue?.font || FONT_OPTIONS[0].value,
    size: cue?.size != null ? cue.size : 110,
    lineHeight: cue?.lineHeight || 1.05,
    align: cue?.align || 'center',
    color: cue?.color || '#f5f5f4',
    caseMode: cue?.case || 'none',
    bold: cue?.bold !== false,
    italic: !!cue?.italic,
    underline: !!cue?.underline,
    strike: !!cue?.strike,
    letterSpacing: Number(cue?.letterSpacing) || 0,
    valign: cue?.valign || 'middle',
    pad: cue?.pad != null ? Number(cue.pad) : 10,
    shadow: !!(cue?.shadow),
    shadowColor: cue?.shadowColor || '#000000',
    shadowBlur: cue?.shadowBlur != null ? Number(cue.shadowBlur) : 14,
    shadowOffsetX: cue?.shadowOffsetX != null ? Number(cue.shadowOffsetX) : 0,
    shadowOffsetY: cue?.shadowOffsetY != null ? Number(cue.shadowOffsetY) : 4,
    outline: !!(cue?.outline),
    strokeColor: cue?.strokeColor || '#000000',
    strokeWidth: cue?.strokeWidth != null ? Number(cue.strokeWidth) : 1.5,
    gradient: !!(cue?.gradient),
    gradientColor1: cue?.gradientColor1 || '#f5f5f4',
    gradientColor2: cue?.gradientColor2 || '#93c5fd',
    gradientAngle: cue?.gradientAngle != null ? Number(cue.gradientAngle) : 180,
    highlight: !!(cue?.highlight),
    hlOpacity: cue?.hlOpacity ?? 40,
    resizeMode: cue?.resizeMode === 'fill' ? 'fill' : cue?.resizeMode === 'scale' ? 'scale' : 'fit',
    fill: cue?.resizeMode === 'fill',
    fillMax: cue?.fillMax != null ? Number(cue.fillMax) : 165,
    fillMin: cue?.fillMin != null ? Number(cue.fillMin) : 18,
    layoutMode: cue?.layoutMode === 'ticker' ? 'ticker' : 'static',
    tickerSpeed: cue?.tickerSpeed != null ? Number(cue.tickerSpeed) : 18,
    tickerDir: cue?.tickerDir === 'rtl' ? 'rtl' : 'ltr',
    box: cue?.box || { x: 80, y: 100, w: 1120, h: 480 },
  });

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
      await ipcRenderer.invoke('db-save-song', editingSong);
      setIsEditorOpen(false);
      fetchSongs();
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

  const thumbBg = (cue) => {
    if (cueHasBackground(cue)) return cue.bg_type === 'color' ? cue.bg_value : NEBULA;
    if (songHasBackground(activeSong)) return activeSong.bg_type === 'color' ? activeSong.bg_value : NEBULA;
    return NEBULA;
  };

  const resolveBg = (cue, song) => {
    if (cueHasBackground(cue)) return { type: cue.bg_type, value: cue.bg_value };
    if (songHasBackground(song)) return { type: song.bg_type, value: song.bg_value };
    return null;
  };

  const activeSlideIndex = (() => {
    if (activeCue == null || activeCue.id === 'clear') return -1;
    if (activeCue.id === 'title-card') return 0;
    const idx = (activeSong?.cues || []).findIndex(c => c.id === activeCue.id);
    return idx >= 0 ? idx + 1 : -1;
  })();

  const groupLabels = (() => {
    const seen = [];
    (activeSong?.cues || []).forEach(c => { if (c.label && !seen.includes(c.label)) seen.push(c.label); });
    return seen;
  })();

  const slideGrid = (() => {
    const tiles = [];
    if (activeSong) tiles.push({ isTitle: true });
    (activeSong?.cues || []).forEach(c => tiles.push({ cue: c, num: tiles.length }));
    return tiles;
  })();

  const renderSlideFace = (tile, { height = '150px', fontSize = '15px', radius = '10px', bg, media } = {}) => {
    const cue = tile.cue;
    const isTitle = tile.isTitle;
    const text = isTitle ? (activeSong.title || '') : (cue?.text || '');
    const label = isTitle ? 'Title' : (cue?.label || 'Slide');
    const bgInfo = (() => {
      if (isTitle) {
        if (songHasBackground(activeSong)) return { type: activeSong.bg_type, value: activeSong.bg_value };
        return null;
      }
      if (cueHasBackground(cue)) return { type: cue.bg_type, value: cue.bg_value };
      if (songHasBackground(activeSong)) return { type: activeSong.bg_type, value: activeSong.bg_value };
      return null;
    })();
    const faceBg = bg || (bgInfo && bgInfo.type === 'color' ? bgInfo.value : (isTitle ? NEBULA : thumbBg(cue)));
    const mediaLayer = media || (bgInfo && bgInfo.type !== 'color' ? { type: bgInfo.type, url: bgInfo.value } : null);
    const isLive = activeCue != null && activeCue.id !== 'clear' && ((isTitle && activeCue.id === 'title-card') || (!isTitle && cue && activeCue.id === cue.id));
    const hasMedia = !!mediaLayer;
    return (
      <div style={{ position: 'relative', height, borderRadius: radius, overflow: 'hidden', background: faceBg, border: isLive ? `2px solid ${PINK}` : '1px solid var(--ui-blight)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', boxShadow: isLive ? `0 0 0 2px rgba(255,79,163,0.25), 0 8px 24px rgba(0,0,0,0.45)` : '0 4px 14px rgba(0,0,0,0.35)', boxSizing: 'border-box' }}>
        {mediaLayer && (
          mediaLayer.type === 'image' ? (
            <img key={`bgimg-${mediaLayer.url}`} src={mediaLayer.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
          ) : (
            <TileVideo key={`bgvid-${mediaLayer.url}`} src={mediaLayer.url} animate={isLive} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
          )
        )}
        {mediaLayer && <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.18)' }} />}
        <div style={{ position: 'absolute', top: 6, left: 8, display: 'flex', alignItems: 'center', gap: 6, zIndex: 2 }}>
          {isLive && <LiveBadge start={slideTimer.start} C={C} PINK={PINK} />}
        </div>
        <div style={{ position: 'absolute', top: 6, right: 8, zIndex: 2, background: 'rgba(0,0,0,0.45)', color: isLive ? PINK : C.heading, borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>
          {isTitle ? '♬' : `#${tile.num}`}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, padding: '14px 10px 10px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.15))' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: isLive ? PINK : C.heading, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            {label}
            {hasMedia && mediaLayer && mediaLayer.type && <span style={{ fontSize: 8, background: 'rgba(192,132,252,0.25)', border: '1px solid rgba(192,132,252,0.5)', color: '#d8b4fe', borderRadius: 4, padding: '0 4px' }}>{String(mediaLayer.type).toUpperCase()}</span>}
          </div>
          <p style={{ margin: 0, fontSize, lineHeight: 1.25, fontWeight: 700, color: C.text, whiteSpace: 'pre-line', textShadow: '0 2px 12px rgba(0,0,0,0.9)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text || '—'}</p>
        </div>
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
    if (!window.require) return;
    const fileName = asset.url.split('/').pop();
    const ok = await appConfirm(`Remove "${fileName}" from the media library?\n\nSongs that reference it will fall back to their color background.`, { confirmLabel: 'Remove' });
    if (!ok) return;
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('db-delete-media', asset.url);
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

  const formatBibleVerse = (v) => {
    let t = typeof v.text === 'string' ? v.text : '';
    if (bibleFmt.caps) t = t.toUpperCase();
    if (bibleFmt.layout !== 'sentence') {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    t = t.trim();
    return bibleFmt.layout === 'number' && v.verse ? `${t}` : t;
  };

  // Builds one scripture slide payload. Accepts a single verse
  // ({ verse, text }) or a combined selection ({ verses: [{verse,text}, ...] })
  // so multi-verse output is always ONE fullscreen slide, never N slides.
  const buildBiblePayload = (src, bgOverride) => {
    const { book, chapter, verse, text, verses } = src || {};
    const verseList = Array.isArray(verses) && verses.length
      ? verses
      : [{ verse, text: text || '' }];
    const first = verseList[0]?.verse;
    const last = verseList[verseList.length - 1]?.verse;
    const refTail = verseList.length > 1 && first !== last ? `${first}-${last}` : (first != null ? `${first}` : '');
    const ref = `${book} ${chapter}${refTail ? `:${refTail}` : ''}`;

    const bodyChunks = [];
    verseList.forEach((vl) => {
      const raw = typeof vl.text === 'string' ? vl.text : '';
      const ls = raw.split('\n');
      ls.forEach((ln, li) => {
        let line = ln.trim();
        // Multi-verse slides always prefix the verse number on the first line
        // of each verse so the congregation can follow along.
        if (verseList.length > 1 && vl.verse != null) {
          line = li === 0 ? `${vl.verse} ${line}` : `  ${line}`;
        }
        bodyChunks.push(bibleFmt.bold ? `**${line}**` : line);
      });
    });
    // Single verse keeps paragraph gaps; multi-verse packs lines tightly so
    // the block can fill the screen without overflow.
    const body = bodyChunks.join(verseList.length > 1 ? '\n' : '\n\n');

    // Scripture always carries its own lyric style: near-fullscreen box +
    // fill-to-fit font so text scales with how many verses are shown.
    const scriptureLyric = {
      font: stageStyle.fontFamily || 'system-ui, sans-serif',
      size: 110,
      lineHeight: 1.12,
      align: 'left',
      color: stageStyle.fontColor || '#ffffff',
      caseMode: 'none',
      fill: true,
      fillMax: 165,
      fillMin: 18,
      box: { x: 32, y: 20, w: 1216, h: 680 },
    };

    const effectiveBg = bgOverride || bibleMedia;
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
      subtitle: `Scripture · ${bibleTrans.toUpperCase()}`,
      content: `${ref}\n\n${body}`,
      style,
      media_type: effectiveBg?.type || null,
      media_url: effectiveBg?.value || null,
      meta: {
        kind: 'bible',
        book,
        chapter,
        verse: first,
        translation: bibleTrans,
        source: { book, chapter, verses: verseList },
      },
    };
    lastBibleRef.current = payload;
    return payload;
  };

  // Background assigned to scripture is applied ONLY to scripture (never to
  // songs or custom slides). If a scripture slide is live, switching the
  // background re-fires it immediately so the output updates in place.
  const applyScriptureBg = (next) => {
    setBibleMedia(next);
    if (next && liveBibleSrcRef.current) {
      fireServiceItemLive(buildBiblePayload(liveBibleSrcRef.current, next));
    }
  };

  const selectBibleMediaLive = (type, value, name) => applyScriptureBg(type && value ? { type, value, name } : null);

  const queueBibleServiceSlide = (src) => {
    const item = buildBiblePayload(src);
    setActiveService(prev => ({ ...prev, items: [...((prev && prev.items) || []), item] }));
  };

  const fireBibleLive = (src) => {
    fireServiceItemLive(buildBiblePayload(src));
  };

  // Ordered list of currently selected verses (empty selection = whole chapter).
  const selectedBibleVerses = () => {
    if (!bibleChapter) return [];
    return (bibleChapter.verses || [])
      .filter(v => bibleSelVerses.length === 0 || bibleSelVerses.includes(v.verse))
      .map(v => ({ verse: v.verse, text: formatBibleVerse(v) }));
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

  const queueBibleSelection = () => {
    const verses = selectedBibleVerses();
    if (!verses.length) return;
    queueBibleServiceSlide({
      book: bibleChapter.book,
      chapter: bibleChapter.chapter,
      verses,
    });
  };

  const loadBibleBooks = async (abbrev = bibleTrans) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('scripture-books', abbrev);
    if (res && res.books) setBibleBooks(res);
    return res;
  };

  const loadBibleChapter = async (abbrev = bibleTrans, bookIndex = bibleSel.bookIndex, chapter = bibleSel.chapter) => {
    if (!window.require || !abbrev) return;
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('scripture-chapter', abbrev, bookIndex, chapter);
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
    const parts = bibleRef.trim().split(/\s+/);
    if (/\d/.test(parts[0]) || (parts.length > 1 && !/\d/.test(parts[1]))) {
      const res = await ipcRenderer.invoke('scripture-search', bibleTrans, bibleRef.trim());
      setBibleSearchResults(res && res.results ? res.results : []);
      return;
    }
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
    { id: 'presentations', label: 'Presentations', iconId: 'presentation', accent: false },
    { id: 'live', label: 'Live', iconId: 'radio', accent: false },
    { id: 'media', label: 'Media', iconId: 'film', accent: false },
    { id: 'audio', label: 'Audio', iconId: 'music', accent: false },
    { id: 'scripture', label: 'Scripture', iconId: 'book-open', accent: false },
    { id: 'outputs', label: 'Outputs', iconId: 'monitor', accent: false },
    { id: 'functions', label: 'Functions', iconId: 'settings', accent: false }
  ];

  const menuItems = {
    file: [
      { label: 'Backup Library', action: handleExport },
      { label: 'Import Library', action: handleImport },
      { label: 'Quit', action: () => window.close() }
    ],
    edit: [
      { label: 'Clear All Outputs', action: () => fireCueLive({ id: 'clear', label: 'Clear', text: '' }) },
      { label: 'Edit Active Song', action: () => { if (activeSong) { setEditingSong(activeSong); setEditorMode('manual'); setRawPasteText(''); setIsEditorOpen(true); } } },
      { label: 'Add Virtual Wall', action: addNewDisplay }
    ],
    view: [
      { label: 'Live Outputs Monitor', action: () => setShowOutputMonitor(true) },
      { label: 'Keyboard Shortcuts', action: () => setShowHotkeys(true) }
    ],
    help: [
      { label: 'Keyboard Shortcuts', action: () => setShowHotkeys(true) },
      { label: 'About KOGWorship', action: () => { setAboutStatus(''); setShowAbout(true); fetchAppInfo(); } }
    ]
  };

  const handleCheckUpdates = async () => {
    const fallback = appInfo?.version || '0.0.0';
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setAboutStatus('Checking for updates...');
        setUpdateReady(null);
        const result = await ipcRenderer.invoke('check-for-updates');
        if (result.error) {
          setAboutStatus(`Update check failed: ${result.error}`);
          setUpdateReady(null);
          return;
        }
        if (result.updateInfo) {
          setAboutStatus(`Update available: v${result.updateInfo.version}`);
          setUpdateReady('available');
        } else {
          setAboutStatus(`App is up to date (v${fallback}).`);
          setUpdateReady(null);
        }
      }
    } catch (e) {
      setAboutStatus(`Update check failed: ${e.message}`);
      setUpdateReady(null);
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setAboutStatus('Starting download...');
        setUpdateProgress(null);
        const result = await ipcRenderer.invoke('download-update');
        if (result.error) {
          setAboutStatus(`Download failed: ${result.error}`);
          setUpdateProgress(null);
        }
      }
    } catch (e) {
      setAboutStatus(`Download failed: ${e.message}`);
      setUpdateProgress(null);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('install-update');
      }
    } catch (e) {
      setAboutStatus(`Install failed: ${e.message}`);
    }
  };

  const handleOpenGuide = () => {
    setAboutStatus('The KOGWorship User Guide is not available yet.');
  };

  const handleDockSelect = (item) => {
    if (item.id === 'outputs') { setShowOutputMonitor(true); return; }
    setDockTab(item.id);
    setLeftOpen(item.id !== 'scripture');
    if (item.id === 'live') { setRightOpen(true); } else { setScheduleView(item.id === 'shows' ? scheduleView : 'schedule'); }
  };

  const handleNewSong = () => {
    setDockTab('shows');
    setLeftOpen(true);
    setScheduleView(scheduleView === 'schedule' ? 'schedule' : scheduleView);
    setEditingSong({ id: null, title: '', artist: '', category: 'Worship', cues: [{ label: 'Verse 1', text: '', box: DEFAULT_BOX, locked: false }] });
    setEditorMode('manual');
    setRawPasteText('');
    setIsEditorOpen(true);
  };

  const leftContent = dockTab;

  const monitorContent = displays.find(d => d.id === 1)?.content || null;

  const renderOutputPreview = () => {
    const st = monitorContent?.style || {};
    const isMediaStyle = (st.backgroundType === 'image' || st.backgroundType === 'video') && !!st.backgroundValue;
    const hasMediaBg = !!monitorContent && isMediaStyle;
    const valid = monitorContent && (monitorContent.text || monitorContent.presentation?.slide || hasMediaBg);
    const transitionSpeed = cssSpeed(st.speed);
    const msNum = parseInt(transitionSpeed) || 400;
    const trans = st.transition || 'none';
    const transitionMap = {
      'fade': `fadeIn ${transitionSpeed} ease-in-out`,
      'slide-up': `slideUp ${transitionSpeed} ease-out`,
      'slide-down': `slideDown ${transitionSpeed} ease-out`,
      'slide-left': `slideLeft ${transitionSpeed} ease-out`,
      'slide-right': `slideRight ${transitionSpeed} ease-out`,
      'zoom-in': `zoomIn ${transitionSpeed} ease-out`,
      'zoom-out': `zoomOut ${transitionSpeed} ease-out`,
      'word-fade': `wordFade ${transitionSpeed} ease-in-out`,
      'word-rise': `wordRise ${transitionSpeed} ease-out`,
      'line-reveal': `lineReveal ${transitionSpeed} ease-out`,
      'type-on': `typeOn ${transitionSpeed} steps(${Math.max(4, Math.round(msNum / 40))})`,
      'char-cascade': `charCascade ${transitionSpeed} ease-out`,
      'pulse': `pulse ${transitionSpeed} ease-in-out`,
      'shimmer': `shimmer ${transitionSpeed} ease-in-out`,
      'blur-in': `blurIn ${transitionSpeed} ease-out`,
      'flip': `flipIn ${transitionSpeed} ease-out`,
      'bounce': `bounceIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
      'drop': `dropIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
      'sway': `swayIn ${transitionSpeed} ease-out`,
      'split': `splitIn ${transitionSpeed} ease-in-out`,
      'wipe-up': `wipeUp ${transitionSpeed} ease-out`,
      'spin': `spinIn ${transitionSpeed} ease-out`,
      'neon': `neonFlash ${transitionSpeed} linear`,
    };
    const animCSS = transitionMap[trans] || '';
    return (
      <div ref={setPreviewWrapRef} style={{ pointerEvents: 'none', position: 'relative', width: '100%', aspectRatio: outputAspect.replace(':', ' / '), borderRadius: 12, overflow: 'hidden', background: '#000', border: 'none', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div style={{ width: 1280 * previewScale, height: 720 * previewScale, position: 'relative', overflow: 'hidden' }}>
            {monitorContent && !monitorContent.presentation && (
              <AnimatePresence>
                <motion.div
                  key={`monBg-${monitorContent.timestamp}-${st.backgroundType}-${st.backgroundValue}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
                >
                  {st.backgroundType === 'image' && (
                    <div style={{ position: 'absolute', inset: 0, background: `url(${st.backgroundValue}) center/cover no-repeat` }} />
                  )}
                  {st.backgroundType === 'video' && (
                    <video src={st.backgroundValue} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {st.backgroundType === 'color' && st.backgroundValue && (
                    <div style={{ position: 'absolute', inset: 0, background: st.backgroundValue }} />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
            {/* Scale on outer, animation on inner — same split as ProjectorDisplay */}
            <div style={{ width: 1280, height: 720, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: 1280, height: 720, position: 'absolute', inset: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <div key={monitorContent?.timestamp} style={{ width: '100%', height: '100%', position: 'relative', animation: monitorContent && !monitorContent.presentation ? (animCSS || undefined) : undefined }}>
                  {monitorContent && monitorContent.presentation?.slide ? (
                    <PresentationSlide slide={monitorContent.presentation.slide} />
                  ) : monitorContent && monitorContent.text ? (
                    (() => {
                      const isTitleSlide = monitorContent.label === 'Song Title';
                      const lst = st.lyric || { font: st.fontFamily || 'system-ui, sans-serif', size: 110, lineHeight: 1.05, align: st.textAlign || 'center', color: st.fontColor || '#ffffff', caseMode: 'none', isTitle: isTitleSlide };
                      lst.isTitle = isTitleSlide;
                      const box = lst.box || { x: 80, y: isTitleSlide ? 140 : 100, w: 1120, h: isTitleSlide ? 440 : 480 };
                      return (
                        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: box.angle ? `rotate(${box.angle}deg)` : undefined, transformOrigin: 'center center' }}>
                          {renderLyricsLayout(monitorContent.text, lst, box)}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        {!valid && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: monitorContent ? 'rgba(0,0,0,0.55)' : 'transparent', color: C.faint2, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>BLACKOUT</div>
        )}
        {monitorContent && (
          <div style={{ position: 'absolute', bottom: 6, left: 8, zIndex: 2, background: 'rgba(0,0,0,0.45)', color: '#d4d4d8', borderRadius: 4, padding: '1px 6px', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{monitorContent.label || 'Slide'}</div>
        )}
      </div>
    );
  };

  if (isStage) {
    return <StageDisplay currentSlide={currentSlide} C={C} />;
  }

  if (isOutput) {
    return outputRole === 'stage'
      ? <StageDisplay currentSlide={currentSlide} C={C} />
      : <ProjectorDisplay currentSlide={currentSlide} C={C} aspect={outputAspect} />;
  }

  if (isProjector) {
    return <ProjectorDisplay currentSlide={currentSlide} C={C} aspect={outputAspect} />;
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
        onStartBlank={() => setShowWelcome(false)}
        onOpenRecent={(id) => { setShowWelcome(false); loadService(id); setDockTab('shows'); setLeftOpen(true); setActiveTab('service'); }}
      />
    );
  }

  const appValue = {
    logoImage,
    themeDark, setThemeDark,
    ACCENT, ACCENT_SOFT, ACCENT_SOFT_2, C, PINK, ACCENT_PINK, PINK_SOFT, PINK_SOFT_2, NEBULA, PINK2, ACCENCY,
    isProjector, setIsProjector, isStage, setIsStage, showSplash, setShowSplash, showWelcome, setShowWelcome,
    currentSlide, setCurrentSlide,
    activeTab, setActiveTab, songs, setSongs, searchQuery, setSearchQuery, showsQuery, setShowsQuery,
    showsCollapsed, setShowsCollapsed, songsCollapsed, setSongsCollapsed, serviceDragOver, setServiceDragOver,
    activeCategory, setActiveCategory, activeSong, setActiveSong, activeCue, setActiveCue,
    leftOpen, setLeftOpen, rightOpen, setRightOpen, showHotkeys, setShowHotkeys, showAbout, setShowAbout, showMoreMenu, setShowMoreMenu,
    dockTab, setDockTab, scheduleView, setScheduleView, activeMenu, setActiveMenu, rightTab, setRightTab,
    mediaLibrary, setMediaLibrary, scriptureBgLibrary, libraryStats, setLibraryStats, appInfo, setAppInfo, audioPreview, setAudioPreview, audioVolume, setAudioVolume,
    bibleLib, setBibleLib, bibleTrans, setBibleTrans, bibleBooks, setBibleBooks, bibleSel, setBibleSel, bibleChapter, setBibleChapter,
    bibleDL, setBibleDL, bibleLibQuery, setBibleLibQuery, bibleLibLoading, setBibleLibLoading, bibleTransOpen, setBibleTransOpen,
    bibleHelpOpen, setBibleHelpOpen, bibleMedia, setBibleMedia, bibleMediaOpen, setBibleMediaOpen, bibleTestament, setBibleTestament,
    bibleBookQuery, setBibleBookQuery, bibleRef, setBibleRef, bibleSearchQuery, setBibleSearchQuery, bibleSearchResults, setBibleSearchResults,
    bibleSelVerses, setBibleSelVerses, bibleFocusedVerse, setBibleFocusedVerse, bibleFmt, setBibleFmt,
    showModalOpen, setShowModalOpen, showBuilder, setShowBuilder,
    builderSongQuery, setBuilderSongQuery, builderSrcSongQuery, setBuilderSrcSongQuery, builderSheet, setBuilderSheet,
    builderTargetSecId, setBuilderTargetSecId, builderTargetSectionId,
    builderDensity, setBuilderDensity, builderTileIdx, setBuilderTileIdx, builderCollapsed, setBuilderCollapsed,
    builderRehearse, setBuilderRehearse, builderActiveSong, setBuilderActiveSong, builderSongDetails, setBuilderSongDetails,
    selectedServiceId, setSelectedServiceId, slideTimer, setSlideTimer, services, setServices, templates, setTemplates,
    selectedTemplateId, setSelectedTemplateId, dragIndex, setDragIndex,
    showTemplateNameModal, setShowTemplateNameModal, templateNameValue, setTemplateNameValue,
    activeService, setActiveService, customSlideModal, setCustomSlideModal, newSlideData, setNewSlideData,
    isEditorOpen, setIsEditorOpen, editorMode, setEditorMode, rawPasteText, setRawPasteText,
    importUrl, setImportUrl, importUrlStatus, setImportUrlStatus, editingSong, setEditingSong, linesPerSlide, setLinesPerSlide,
    isParsing, setIsParsing, isFetching, setIsFetching,
    editorCueIdx, setEditorCueIdx, canvasEdit, setCanvasEdit, boxDrag, setBoxDrag, canvasScale, setCanvasScale,
    dragFrom, setDragFrom, showSlideProps, setShowSlideProps, serviceCollapsed, setServiceCollapsed,
    serviceAddMenu, setServiceAddMenu, serviceSongQuery, setServiceSongQuery, serviceTargetTitle, setServiceTargetTitle, serviceSectionTitles,
    serviceMediaPicker, setServiceMediaPicker,
    previewScale, setPreviewScale, outputAspect, setOutputAspect, selectedAiModel, setSelectedAiModel, aiStatus, setAiStatus,
    stageStyle, setStageStyle, displays, setDisplays, targetedDisplays, setTargetedDisplays,
    outputDisplays, outputs, updateOutput, addOutput, removeOutput, setOutputRunning, selectOutputDisplay, selectStageDisplay, showOutputMonitor, setShowOutputMonitor,
    bibleLastVerseRef, canvasWrapRef, editAreaRef, previewObsRef, setPreviewWrapRef,
    fetchSongs, fetchServices, fetchMediaLibrary, fetchLibraryStats, fetchAppInfo, fetchTemplates,
    applyTemplate, saveCurrentTemplate, confirmSaveTemplate, removeTemplate, selectSong, editSong,
    selectBibleMedia, importBibleMedia, selectBibleMediaLive, handleNextCue, handlePrevCue, toggleTarget, addNewDisplay, persistMediaFile,
    sendStageData, isPlainBg, cueHasBackground,
    songHasBackground, songBackgroundStyle, resolutionStyle, defaultShowSections, openNewShow, closeShowModal,
    addSongToSection, addSlideToSection, updateShowItem, removeShowItem, addShowSection, renameShowSection,
    removeShowSection, moveShowSection, showTotalSeconds, createShow, selectBuilderItem, builderItemSlideCount,
    builderFlatItems, builderTotalSlides, builderCurrentEntry, builderGoLive, builderAdvance, builderUpNext,
    addShowBuilderMedia, addShowBuilderPlaceholder, fireCueLive, fireTitleLive, fireServiceItemLive,
    toggleDevProjectorWindow, toggleStageWindow, addSongToService, addHeaderToService, renameServiceHeader, addCustomSlideToService,
    reorderServiceItem, moveServiceBlock, moveServiceItem, removeServiceItem, serviceOrderCount, serviceSlideCount,
    serviceStatusIcon, serviceItemIsLive, toggleServiceCollapse, expandAllServiceSections, collapseAllServiceSections,
    clearServiceOrder, addMediaItemToService, addExistingMediaToService, fireServiceMediaLive, stopServiceItemLive, saveCurrentService, loadService, queueShowIntoService,
    presentations, setPresentations, fetchPresentations, isPresentationOpen, editingDeck, setEditingDeck,
    openPresentationEditor, closePresentationEditor, openPresentation, savePresentationDeck, deletePresentationDeck,
    presentDeck, firePresentationSlide, addPresentationToService, activePresentation, stopPresentation,
    processAutoPaste, fetchSongFromUrl, moveCue, duplicateCue, setCueBackground, cueFileToBackground, setSongBackground,
    songBgFileToBackground, clearCueBackground, splitCuesToLines, clampNum, editorCue, editorBox, updateCue, updateCueThrottled, applyFontToAllCues, applyPatchToAllCues,
    baseGroupLabel, nextSuffixLetter, splitCueAtTextareaCaret, applyAlignToAll, applyAnimToAll, reorderCues,
    startBoxDrag, onStagePointerMove, endBoxDrag, ToolbarBtn, fitStageFont, cueLyricStyle, handleSaveSong,
    previewAnimation,
    handleDeleteSong, handleToggleFavorite, handleExport, handleImport, serviceSections, thumbBg, resolveBg,
    activeSlideIndex, groupLabels, slideGrid, renderSlideFace, applyMediaToActiveSong, importMediaAsset, removeMediaAsset,
    toggleAudioPreview, clearSongAudio, refreshBibleLib, formatBibleVerse, buildBiblePayload, queueBibleServiceSlide,
    fireBibleLive, fireBibleSelectionLive, queueBibleSelection, loadBibleBooks, loadBibleChapter, selectBibleBook,
    selectBibleChapter, handleBibleVerseClick, resetBibleToBooks, resetBibleToBook, openBibleTranslation, downloadBible,
    deleteBibleTranslation, resolveBibleReference, searchBibleKeywords, bibleActiveEntry, bibleInstalledLib,
    bibleLibQueryTrim, bibleLibFiltered, bibleAllBooks, bibleOtCount, bibleNtCount, bibleFilteredBooks, bibleStep,
    deleteSavedService, shellOpenDataFolder, dockItems, menuItems, handleDockSelect, handleNewSong,
    leftContent, monitorContent, renderOutputPreview, DEFAULT_BOX,
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

      {/* ===== TOP HEADER ===== */}
      <TopHeader
        C={C}
        PINK={PINK}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        menuItems={menuItems}
        activeCue={activeCue}
        toggleDevProjectorWindow={toggleDevProjectorWindow}
        toggleStageWindow={toggleStageWindow}
        openNewShow={openNewShow}
        themeDark={themeDark}
        toggleTheme={toggleTheme}
      />

      {/* ===== MAIN WORKSPACE ===== */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, width: '100%' }}>

{/* LEFT SIDEBAR */}
        <LeftSidebar />

        {/* CENTER WORKSPACE: SCRIPTURE BROWSER / SLIDE GRID / LAUNCHPAD */}
        <CenterWorkspace />

        {/* RIGHT SIDEBAR: OUTPUT MONITOR + CONTROLS */}
        <LiveOutputPanel
          C={C}
          PINK={PINK}
          activeSlideIndex={activeSlideIndex}
          slideCount={slideGrid.length}
          renderOutputPreview={renderOutputPreview}
          outputDisplays={outputDisplays}
          selectedOutputDisplay={outputs.find(o => o.id === 'projector')?.displayId ?? null}
          selectOutputDisplay={selectOutputDisplay}
          activeCue={activeCue}
          fireCueLive={fireCueLive}
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
          selectBibleMediaLive={selectBibleMediaLive}
          importBibleMedia={importBibleMedia}
          dockTab={dockTab}
          fireBibleSelectionLive={fireBibleSelectionLive}
          bibleSelCount={bibleSelVerses.length}
        />
      </div>

      {/* ===== BOTTOM GLOBAL DOCK ===== */}
      <BottomDock
        C={C}
        PINK={PINK}
        dockItems={dockItems}
        dockTab={dockTab}
        activeId={showOutputMonitor ? 'outputs' : undefined}
        onSelect={handleDockSelect}
        onNewSong={handleNewSong}
      />

      {/* CUSTOM SLIDE MODAL */}
      <AnimatePresence>
      {customSlideModal && (
        <CustomSlideModal
          C={C}
          ACCENT={ACCENT}
          newSlideData={newSlideData}
          setNewSlideData={setNewSlideData}
          onCancel={() => setCustomSlideModal(false)}
          onAdd={addCustomSlideToService}
        />
      )}
      </AnimatePresence>

      {/* SONG EDITOR MODAL */}
      <AnimatePresence>
      {isEditorOpen && (
        <SongEditorModal />
      )}
      </AnimatePresence>
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

      {/* ABOUT KOGWORSHIP */}
      <AnimatePresence>
      {showAbout && (
        <AboutModal
          C={C}
          ACCENT={ACCENT}
          PINK={PINK}
          version={appInfo?.version || '1.0.0'}
          status={aboutStatus}
          updateReady={updateReady}
          updateProgress={updateProgress}
          onCheckUpdates={handleCheckUpdates}
          onDownloadUpdate={handleDownloadUpdate}
          onInstallUpdate={handleInstallUpdate}
          onOpenGuide={handleOpenGuide}
          onClose={() => { setShowAbout(false); setUpdateReady(null); setUpdateProgress(null); }}
        />
      )}
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
          onConfirm={() => resolveConfirmDialog(true)}
          onCancel={() => resolveConfirmDialog(false)}
        />
      )}
      </AnimatePresence>

    </div>
    </AppProvider>
  );
}