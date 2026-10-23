import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, ChevronRight, ChevronDown, ChevronUp, Trash2, Star, Clock, Edit3, Image as ImageIcon, Video, Folder, FileText, Sparkles, Monitor, Download, Upload, Images, PanelLeftClose, PanelLeftOpen, Music, MonitorPlay, Pencil, BookOpen, Link2, ListMusic, Home, Presentation, Film, Timer, Settings, Clapperboard, Mic, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { ROW_KIND, iconHue } from '../lib/icons';
import { stubTap, iconBtnTap } from '../lib/anim';
import Dropdown from './Dropdown';
import VideoLibrarySidebar from './VideoLibrarySidebar';
import { LazyVideo } from '../lib/lazyVideo';
// Untitled UI — migration phase 3 (tabs): RAC-backed Tabs for the Service
// Order / Shows / Songs switcher (mirror layout documented in NewSongPrompt).
import { Tabs, TabList, Tab } from '../untitledui/components/application/tabs/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import logoImage from '../assets/logo.png';

/* Left-to-right order of the sub-tabs — used to give the panel swap a
   direction, so switching to a tab further right slides content in from the
   right and back is the mirror of that. */
const TAB_ORDER = ['order', 'shows', 'songs'];

/* The library's three fixed views. Favorites and Recent have been understood
   by getSongs() from the very beginning — the sidebar simply never had a
   control able to reach them, which is exactly why both read as dead code.
   Real categories are appended from whatever the songs table contains. */
const LIBRARY_CHIPS = [
  { id: 'All', label: 'All', title: 'Every song in the library' },
  { id: 'Favorites', label: 'Favorites', Icon: Star, title: 'Songs you have starred' },
  { id: 'Recent', label: 'Recent', Icon: Clock, title: 'The 10 songs you opened most recently' },
];

/* Non-Home workspaces replace the Service Order in this column with a short
   guide. The running order only belongs on Home; everywhere else the operator
   needs to know what the workspace is for, not see a second copy of the plan. */
const WORKSPACE_GUIDES = {
  presentations: {
    Icon: MonitorPlay,
    title: 'Presentation playback',
    blurb: 'Load a PowerPoint, WPS or LibreOffice file and reveal it behind the lyrics on the live output.',
    tips: [
      'Open a .pptx, .ppt, .ppsx, .odp, .otp or .dps file from the workspace.',
      'F1 brings lyrics forward; F2 reveals the presentation again.',
      'Create and import decks from the Slideshow tab.',
    ],
    action: { id: 'sermon', label: 'Open Slideshow' },
  },
  media: {
    Icon: Film,
    title: 'Media library',
    blurb: 'Images and video for backgrounds, sermon slides and service-order cues.',
    tips: [
      'Add files in the workspace and they join the library immediately.',
      'Drag a media item into the Home service order to schedule it.',
      'Use Send Live when a clip should appear on the output now.',
    ],
  },
  audio: {
    Icon: Music,
    title: 'Audio workspace',
    blurb: 'Song audio, pads and background music stay ready without leaving the live console.',
    tips: [
      'Preview a track before sending it to the live output.',
      'Loop pads for prayer or walk-in beds.',
      'Build a BGM playlist for pre-service and transitions.',
    ],
  },
  countdown: {
    Icon: Timer,
    title: 'Countdown',
    blurb: 'Run a pre-service or worship countdown with its own background and live control.',
    tips: [
      'Set the duration, then start or hold it from the workspace.',
      'The countdown is a live output item, so Clear All will remove it.',
      'Use the right panel to keep an eye on what is currently live.',
    ],
  },
  stage: {
    Icon: Mic,
    title: 'Stage monitor',
    blurb: 'Configure what the band and speakers see on their confidence display.',
    tips: [
      'Choose the current lyric, next item and clock shown on stage.',
      'Stage content updates from the live service automatically.',
      'Open Countdown to edit the timer the stage screen displays.',
    ],
    action: { id: 'countdown', label: 'Open Countdown' },
  },
  scripture: {
    Icon: BookOpen,
    title: 'Scripture',
    blurb: 'Search the Bible, build a passage and send it live with your normal slide styling.',
    tips: [
      'Pick a book, then a chapter, then click a verse to send it.',
      'Ctrl+Click multi-selects; Shift+Click grabs a range.',
      'Use Add to Playlist to keep a passage ready for later.',
    ],
  },
};

export default function LeftSidebar() {
  const app = useApp();
  const {
    C,
    PINK,
    ACCENT,
    iconTheme,
    leftOpen,
    setLeftOpen,
    viewTab,
    setViewTab,
    dockTab,
    dockItems,
    handleDockSelect,
    services,
    showsQuery,
    setShowsQuery,
    activeService,
    songs,
    activeSong,
    activeCue,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    songCategories,
    serviceAddMenu,
    setServiceAddMenu,
    serviceSongQuery,
    setServiceSongQuery,
    serviceTargetTitle,
    setServiceTargetTitle,
    serviceSectionTitles,
    serviceDragOver,
    setServiceDragOver,
    mediaLibrary,
    audioPreview,
    setAudioPreview,
    templates,
    libraryStats,
    appInfo,
    bibleActiveEntry,
    openNewShow,
    loadService,
    queueShowIntoService,
    deleteSavedService,
    serviceOrderCount,
    serviceItemIsLive,
    collapseAllServiceSections,
    expandAllServiceSections,
    addHeaderToService,
    clearServiceOrder,
    addSongToService,
    selectSong,
    editSong,
    moveServiceBlock,
    renameServiceHeader,
    toggleServiceCollapse,
    removeServiceItem,
    fireServiceItemLive,
    stopServiceItemLive,
    openMedleyForRow,
    openArrangementForRow,
    handleToggleFavorite,
    handleDeleteSong,
    setEditingSong,
    setEditorMode,
    setRawPasteText,
    setIsEditorOpen,
    handleNewSong,
    toggleDevProjectorWindow,
    addNewDisplay,
    fireCueLive,
    saveCurrentTemplate,
    applyTemplate,
    removeTemplate,
    cueHasBackground,
    songHasBackground,
    importMediaAsset,
    applyMediaToActiveSong,
    removeMediaAsset,
    toggleAudioPreview,
    clearSongAudio,
    saveCurrentService,
    serviceDirty,
    handleExport,
    handleImport,
    shellOpenDataFolder,
    openCustomSlideEditor,
    setServices,
    setActiveService,
    serviceCollapsed,
    addMediaItemToService,
    addExistingMediaToService,
    serviceMediaPicker,
    setServiceMediaPicker,
    fetchMediaLibrary,
    presentations,
    openPresentationEditor,
    openPresentation,
    deletePresentationDeck,
    presentDeck,
    addPresentationToService,
    bibleBooks,
    loadBibleBooks,
    bibleTrans,
    addScriptureToPlan,
    sameSongId
  } = app;

  const [sectionRenameIdx, setSectionRenameIdx] = useState(null);
  // Per-song backup for laptop-to-laptop transfer: tick songs, export to a
  // file, Import Library on the other machine takes it as-is.
  const [exportMode, setExportMode] = useState(false);
  const [exportSel, setExportSel] = useState([]);
  const [exportMsg, setExportMsg] = useState(null);
  const toggleExportSel = (id) => {
    setExportMsg(null);
    setExportSel((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const runExportSelected = async () => {
    if (!exportSel.length || !window.require) return;
    setExportMsg('Preparing…');
    try {
      const { ipcRenderer } = window.require('electron');
      const res = await ipcRenderer.invoke('db-export-songs', exportSel);
      if (res && res.ok) {
        const mediaNote = res.media && res.media.length
          ? ` Also copy ${res.media.length} media file${res.media.length === 1 ? '' : 's'} (video/audio backgrounds) from the app-data media folder to the other laptop.`
          : '';
        setExportMsg(`Exported ${res.count} song${res.count === 1 ? '' : 's'}.${mediaNote}`);
        setExportSel([]);
        setExportMode(false);
      } else if (res && !res.canceled) {
        setExportMsg(res.error || 'Export failed.');
      } else {
        setExportMsg(null);
      }
    } catch (e) {
      setExportMsg('Export failed: ' + (e.message || e));
    }
  };  // Which of the three panels is on screen. They used to share one narrow
  // column — three headers, a divider and a few hundred pixels split three
  // ways, so each list was only a handful of rows tall. One at a time gives
  // every section room. Cross-list adds no longer lean on drag (two panels
  // are never visible together now); each row's + Plan button does the same
  // job, and the order's Add Song / Scripture / Media / Presentation pickers
  // cover the rest.
  // viewTab (Service Order / Shows / Songs) comes from App context now — the
  // whole sidebar unmounts while the song-editor page is open, and App-owned
  // state keeps the operator on the tab they came from.
  // Which way the panel swap travels: +1 toward the tab on the right, -1
  // back toward the left. The ref only catches up in an effect, so the
  // render that sees the NEW tab still finds the OLD index in it — that
  // comparison is what tells us the direction we came from.
  const tabIdx = TAB_ORDER.indexOf(viewTab);
  const lastTabIdx = useRef(tabIdx);
  const tabDir = tabIdx >= lastTabIdx.current ? 1 : -1;
  useEffect(() => { lastTabIdx.current = tabIdx; }, [tabIdx]);
  const [sectionRenameTitle, setSectionRenameTitle] = useState('');
  // Drag-to-reorder on the service order. Only the ITEMS are draggable — a
  // section heading is a click target (collapse, rename, set ADD TO), so
  // making it draggable too was pulling whole blocks around by accident.
  // dropRow is the flat index of the row currently lighting up; headings and
  // items share the running flatIdx, so one number identifies either. The
  // actual insert position lives in dropRef, because it can point at a gap
  // between rows rather than at a row at all.
  const [dropRow, setDropRow] = useState(null);
  const dropRef = useRef(null);
  // Set from the item's dragstart so the list knows the drag came from its
  // own rows — the outer "drop a show/song here" dashed border then stays
  // out of the way, and the reorder never falls into that external handler.
  const internalDrag = useRef(false);
  // Two pieces of feedback, updated together: where the item will land
  // (dropRef, consumed by the drop handler) and which row lights up for it.
  const setDrop = (at, row) => { dropRef.current = at; setDropRow(row); };
  // Where the drop should insert, read from where the pointer actually is.
  // Scanned on dragover rather than on drop, so the row under the cursor is
  // the one lit up while you move. Over a row: that row's own index (upper
  // half = insert above, lower half = insert below). Over a heading: always
  // the start of that section — dropping on a heading should put the item
  // INTO that section, not above it. In the 8px gap between rows, which is
  // the easy thing to hit: nearest row by its centre, so the item lands
  // where the pointer was instead of jumping to the end of the order.
  const scanDropTarget = (e) => {
    const items = activeService?.items || [];
    let el = e.target;
    while (el && el !== e.currentTarget && el.getAttribute && el.getAttribute('data-drop-idx') === null) el = el.parentElement;
    if (el && el !== e.currentTarget && el.getAttribute && el.getAttribute('data-drop-idx') !== null) {
      const idx = Number(el.getAttribute('data-drop-idx'));
      if (el.getAttribute('data-drop-section')) return { at: idx + 1, row: idx };
      const r = el.getBoundingClientRect();
      return { at: e.clientY < r.top + r.height / 2 ? idx : idx + 1, row: idx };
    }
    let at = items.length;
    let row = null;
    const kids = Array.prototype.slice.call(e.currentTarget.children);
    for (let i = 0; i < kids.length; i++) {
      const raw = kids[i].getAttribute('data-drop-idx');
      if (raw === null) continue;
      const r = kids[i].getBoundingClientRect();
      row = Number(raw);
      if (e.clientY < r.top + r.height / 2) return { at: row, row };
      at = row + 1;
    }
    return { at, row };
  };
  const dropOnOrder = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = dropRef.current;
    internalDrag.current = false;
    setDrop(null, null);
    setServiceDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (!data) return;
      if (data.kind === 'reorder') {
        if (target !== null && target !== undefined) moveServiceBlock(Number(data.from), target);
      } else if (data.kind === 'show') queueShowIntoService(data.id);
      else if (data.kind === 'song') { const song = songs.find(s => s.id === data.id); if (song) addSongToService(song); }
    } catch (_) {}
  };
  // Scripture picker — local on purpose. Nothing here selects a book/chapter in
  // the Scripture tab, so the operator can add three passages in a row without
  // the reading pane jumping around under them.
  const [scBook, setScBook] = useState('');
  const [scChapter, setScChapter] = useState('');
  const [scVerses, setScVerses] = useState('');
  const [scBusy, setScBusy] = useState(false);
  const [scMsg, setScMsg] = useState(null);
  // Which presentation is mid-load into the order (avoids double inserts).
  const [deckBusy, setDeckBusy] = useState(null);

  // The ADD TO row's buttons are styled by the .svc-add class in index.css
  // (ghost buttons with hover) — CSS, not inline styles, because the hover
  // state is half the point.

  // Shared control styling for the scripture picker's inputs.
  const selStyle = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--ui-border)',
    borderRadius: 7,
    padding: '5px 7px',
    color: 'var(--ui-text)',
    fontSize: 11,
    outline: 'none',
    cursor: 'pointer'
  };

  const addScriptureNow = async () => {
    if (scBusy) return;
    const book = (bibleBooks?.books || []).find(b => String(b.nr) === String(scBook));
    if (!book) { setScMsg({ err: 'Choose a book.' }); return; }
    if (!scChapter) { setScMsg({ err: 'Choose a chapter.' }); return; }
    setScBusy(true);
    setScMsg(null);
    try {
      const res = await addScriptureToPlan({ bookIndex: book.nr, bookName: book.name, chapter: Number(scChapter), verseRange: scVerses });
      if (res && res.ok) {
        // Spell out where it landed — the ADD TO section is easy to miss.
        setScMsg({ ok: `Added ${res.ref} · ${res.count} verse${res.count === 1 ? '' : 's'} → ${res.target || 'end of order'}` });
        setScVerses('');
      } else {
        setScMsg({ err: (res && res.error) || 'Could not add that passage.' });
      }
    } finally {
      setScBusy(false);
    }
  };

  const beginRenameSection = (idx, title) => {
    setSectionRenameIdx(idx);
    setSectionRenameTitle(title || '');
  };
  // A double-click fires onClick TWICE before onDoubleClick: without this the
  // section collapses, re-opens (flicker) and steals ADD TO on the way to
  // rename. The second press inside 350ms belongs to the double-click.
  const sectionClickAt = useRef(0);
  const sectionHeaderClick = (idx, title) => {
    if (sectionRenameIdx === idx) return;
    if (sectionRenameIdx === idx) return;
    const now = Date.now();
    if (now - sectionClickAt.current < 350) { sectionClickAt.current = 0; return; }
    sectionClickAt.current = now;
    setServiceTargetTitle(title);
    toggleServiceCollapse(title);
  };

  const commitRenameSection = () => {
    if (sectionRenameIdx == null) return;
    renameServiceHeader(sectionRenameIdx, sectionRenameTitle.trim() || 'Section');
    setSectionRenameIdx(null);
    setSectionRenameTitle('');
  };

  // Shows-card item count. The plan you have OPEN may have unsaved adds, so it
  // reads its live length; every other saved show reads the count getServices()
  // computes from service_items. Both exclude section headers, so the card and
  // the "N total items" readout above the Service Order always agree.
  const showItemCount = (svc) =>
    (activeService && activeService.id === svc.id) ? serviceOrderCount() : (svc.item_count || 0);

  // Date set in New Show. Stored as "YYYY-MM-DD" (or a full ISO string when the
  // show already carried one), and a bare date is parsed at midnight so it
  // cannot render as the day before in timezones west of UTC. Same wording the
  // Saved panel uses for this field.
  const fmtShowDate = (d) => {
    if (!d) return '';
    const s = String(d);
    try {
      return new Date(s.length === 10 ? s + 'T00:00:00' : s)
        .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (_) { return s; }
  };

  // Primary application navigation — the single home for every workspace.
  // The old bottom dock is gone; these entries call the exact same
  // handleDockSelect handler (and therefore the same state) it used.
  const PRIMARY_NAV = [
    { id: 'shows', label: 'Home', Icon: Home, title: 'Service order and libraries' },
    { id: 'presentations', label: 'Presentations', Icon: Presentation, title: 'Presentation playback' },
    { id: 'media', label: 'Media', Icon: Film, title: 'Images and video library' },
    { id: 'audio', label: 'Audio', Icon: Music, title: 'Song audio, pads and playlists' },
    { id: 'countdown', label: 'Countdown', Icon: Timer, title: 'Service countdown' },
    { id: 'scripture', label: 'Scripture', Icon: BookOpen, title: 'Bible and scripture presentation' },
    { id: 'settings', label: 'Settings', Icon: Settings, title: 'Application settings' },
  ];
  const UTILITY_NAV = [
    { id: 'videos', label: 'Videos', Icon: Clapperboard, title: 'Video booth and playlist' },
    { id: 'stage', label: 'Stage', Icon: Mic, title: 'Stage monitor configuration' },
    { id: 'sermon', label: 'Slideshow', Icon: MonitorPlay, title: 'Create, import and present slide decks' },
    { id: 'outputs', label: 'Outputs', Icon: Monitor, title: 'Manage live outputs and displays' },
  ];
  const goTo = (id) => {
    setLeftOpen(true);
    handleDockSelect({ id });
  };

  // A compact, useful description for every workspace that is not Home. This
  // replaces the old mini running order: the Service Order belongs to Home,
  // where the operator can actually edit it, not to every tool in the app.
  const renderWorkspaceGuide = (id) => {
    const guide = WORKSPACE_GUIDES[id];
    if (!guide) return null;
    const GuideIcon = guide.Icon;
    return (
      <div className="kog-sidebar-guide">
        <div className="kog-guide-hero">
          <span className="kog-guide-icon" aria-hidden="true"><GuideIcon size={19} strokeWidth={1.9} /></span>
          <div style={{ minWidth: 0 }}>
            <h3>{guide.title}</h3>
            <p>{guide.blurb}</p>
          </div>
        </div>
        <div className="kog-guide-card">
          <div className="kog-guide-eyebrow">Good to know</div>
          <ul>
            {guide.tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
        <div className="kog-guide-actions">
          {guide.action ? (
            <button type="button" className="kog-guide-primary" onClick={() => goTo(guide.action.id)}>
              {guide.action.label}
              <ChevronRight size={13} />
            </button>
          ) : null}
          <button type="button" className="kog-guide-secondary" onClick={() => goTo('shows')}>
            <Home size={13} />
            Back to Service Order
          </button>
        </div>
      </div>
    );
  };

  const sectionTitle = dockTab === 'shows' ? 'Service Order'
    : dockTab === 'presentations' ? 'Presentations'
      : dockTab === 'settings' ? 'Settings'
        : dockTab === 'videos' ? 'Videos'
          : dockTab === 'sermon' ? 'Slideshow'
            : (PRIMARY_NAV.find((i) => i.id === dockTab)?.label
              || UTILITY_NAV.find((i) => i.id === dockTab)?.label
              || 'Tools');


  return (
    <>
    <motion.div
      animate={{ width: leftOpen ? 264 : 0, opacity: leftOpen ? 1 : 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ flexShrink: 0, overflow: 'hidden', height: '100%' }}
    >
    <div className="kog-sidebar" style={{ width: '100%' }}>
      {/* BRANDING */}
      <div className="kog-brand">
        <img src={logoImage} alt="KOG Worship" />
        <div style={{ minWidth: 0 }}>
          <div className="kog-brand-name">KOG<em>Worship</em></div>
          <span className="kog-brand-sub">Live Production</span>
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="kog-icon-btn"
          onClick={() => setLeftOpen(false)}
          title="Collapse navigation"
          aria-label="Collapse navigation"
          style={{ width: 26, height: 26, padding: 0, border: '1px solid transparent', background: 'transparent' }}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* PRIMARY NAVIGATION */}
      <nav className="kog-nav" aria-label="Application">
        <div className="kog-nav-label">Workspace</div>
        {PRIMARY_NAV.map(({ id, label, Icon, title }) => (
          <button
            key={id}
            type="button"
            className="kog-nav-btn"
            data-active={dockTab === id ? '1' : '0'}
            onClick={() => goTo(id)}
            title={title}
            aria-current={dockTab === id ? 'page' : undefined}
          >
            <Icon size={15} strokeWidth={1.9} />
            <span>{label}</span>
            {id === 'shows' && serviceOrderCount() > 0 ? (
              <span className="kog-nav-count">{serviceOrderCount()}</span>
            ) : null}

          </button>
        ))}
      </nav>

      {/* SECTION HEADING — service order by default, tool name for the rest. */}
      <div className="kog-sidebar-section">
        <h2>{sectionTitle}</h2>
        {dockTab === 'shows' && serviceDirty ? (
          <span title="Unsaved changes in this service order" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--kog-warning)', flexShrink: 0 }} />
        ) : null}
        <span className="kog-spacer" />
        {dockTab === 'shows' ? (
          <>
            <button
              type="button"
              onClick={collapseAllServiceSections}
              title="Collapse all sections"
              aria-label="Collapse all sections"
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              onClick={expandAllServiceSections}
              title="Expand all sections"
              aria-label="Expand all sections"
            >
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              onClick={saveCurrentService}
              title="Save this service plan"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px',
                borderRadius: 4, border: '1px solid ' + (serviceDirty ? 'rgba(255,184,0,0.5)' : 'var(--ui-border2)'),
                background: serviceDirty ? 'var(--kog-accent-bg)' : 'transparent',
                color: serviceDirty ? 'var(--kog-accent-hover)' : 'var(--ui-muted)',
                fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Save plan
            </button>
          </>
        ) : null}
      </div>

      {/* PER-TOOL BODY */}
      <div key={dockTab} className="sidebar-body">
  {(() => {
    if (dockTab === 'shows') {
      return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* SUB-TABS — one panel at a time instead of three stacked into the
              same narrow column. Counts live on the tab so nothing is hidden
              behind the switch. */}
          <div className="side-tabs">
            {/* Untitled UI Tabs (phase 3): brand chips with real tab roles +
                keyboard nav (arrows / Home / End). The 340px column can't fit
                their 14px default labels + count pills (~335px of 318px), so
                the label size stays at the sidebar's tuned 10px density via
                className; counts ride their Badge (`String()` keeps a 0
                count visible). The AnimatePresence panel swap below is
                untouched — it keys off viewTab exactly as before. */}
            <Tabs selectedKey={viewTab} onSelectionChange={setViewTab}>
              <TabList type="button-brand" size="sm" fullWidth>
                <Tab id="order" label="Order" badge={String(serviceOrderCount())} title="The running order you are building" className="text-[10px] px-1.5" />
                <Tab id="shows" label="Shows" badge={String((services || []).length)} title="Saved shows — click to load one, or use + Plan to queue it" className="text-[10px] px-1.5" />
                <Tab id="songs" label="Songs" badge={String(songs.length)} title="Song library" className="text-[10px] px-1.5" />
              </TabList>
            </Tabs>
          </div>

          {/* Panel swap — the panel leaving slides toward the tab you are
              heading for, the one arriving follows it in. Exit runs first
              (mode="wait"), so the two lists never overlap in a 340px column,
              and at ~170ms the hand-off still reads as instant. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={viewTab}
              initial={{ opacity: 0, x: tabDir * 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tabDir * -20 }}
              transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >

          {/* PANEL 1 — SHOWS LIBRARY */}
          {viewTab === 'shows' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* One slim action bar: the filter fills the space beside
                + New Show instead of sitting on a second row above the list. */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={12} color="var(--ui-faint)" style={{ position: 'absolute', left: 8, top: 6, pointerEvents: 'none' }} />
                <input value={showsQuery} onChange={(e) => setShowsQuery(e.target.value)} placeholder="Filter shows…" style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '5px 8px 5px 25px', color: 'var(--ui-text)', fontSize: 11.5, outline: 'none' }} />
              </div>
              <button onClick={(e) => { e.stopPropagation(); openNewShow(); }} title="New Show" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '4px 11px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}><Plus size={11} /> New Show</button>
            </div>
            <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px 10px', display: 'grid', gap: 6, alignContent: 'start' }}>
                  {/* Rows are no longer draggable: the Service Order lives on
                      its own tab now, so a show row and the drop target are
                      never on screen together — + Plan on hover does that job. */}
                  {[...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).filter(s => !showsQuery.trim() || (s.name || '').toLowerCase().includes(showsQuery.trim().toLowerCase())).map(svc => (
                    <div key={svc.id} className="row" onClick={() => { loadService(svc.id); setViewTab('order'); }} title="Load this show into the Service Order" style={{ background: activeService?.id === svc.id ? 'rgba(255,184,0,0.15)' : 'var(--ui-elev2)', border: activeService?.id === svc.id ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: svc.date ? '#f59e0b' : 'var(--ui-faint)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtShowDate(svc.date) || 'No date'}</span>
                        <span style={{ fontSize: 10, color: 'var(--ui-faint)', display: 'block' }}>{svc.category || 'Worship'} • {svc.ratio || '16:9'} • {showItemCount(svc)} items</span>
                      </div>
                      {/* Action cluster — hover-revealed so a list of shows
                          reads as titles and dates, not as a wall of chips. */}
                      <div className="row-act" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); queueShowIntoService(svc.id); setViewTab('order'); }} title="Add to Service Plan — jumps to the order so you see it land" style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: '#FFC72C', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSavedService(svc.id); }} title="Delete show" style={{ background: 'rgba(255,69,69,0.10)', border: '1px solid rgba(255,69,69,0.28)', color: '#FF4545', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                  {!services || services.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 11, padding: 10 }}>No shows yet. Press "New Show" to build your first presentation.</div>
                  ) : showsQuery.trim() && [...services].filter(s => (s.name || '').toLowerCase().includes(showsQuery.trim().toLowerCase())).length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 11, padding: 8 }}>No shows match "{showsQuery}".</div>
                  ) : null}
                </div>
            </>
          </div>
          )}

          {/* PANEL 2 — SERVICE ORDER (G-Presenter style). Full height now:
              this is the panel the operator actually runs the service from,
              so it stops splitting the column with two libraries. */}
          {viewTab === 'order' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px 8px 10px', borderBottom: '1px solid var(--ui-border)', flexShrink: 0 }}>
              {/* The panel title and the item count now live on the sub-tab
                  above — repeating them here stacked the same information
                  twice in a 340px column.

                  One header row instead of two. ADD TO anchors the left edge
                  and the section controls sit flush right, which is what
                  closes the empty gutter above the picker and the one to the
                  left of + Section. The field is capped at 150px and allowed
                  to shrink further: it names a target, it is not a banner. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Add to</span>
                <Dropdown
                  value={serviceTargetTitle || ''}
                  onChange={(v) => setServiceTargetTitle(v || null)}
                  options={[{ value: '', label: 'End of order' }, ...serviceSectionTitles().map(t => ({ value: t, label: t }))]}
                  placeholder="End of order"
                  title="Section that songs, media, scripture and presentations go into"
                  style={{ flex: '1 1 90px', minWidth: 0 }}
                />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => addHeaderToService('New Section')} title="+ New Section" style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--ui-border)', color: 'var(--ui-text2)', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><Plus size={11} /> Section</button>
                  <button onClick={clearServiceOrder} title="Clear order" style={{ background: 'rgba(255,69,69,0.10)', border: '1px solid rgba(255,69,69,0.28)', color: '#FF4545', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                </div>
              </div>
              {/* Ghost buttons — no border box at rest, so four actions in a
                  single row read as one calm line instead of four stacked
                  chips. Icons and padding are trimmed a notch so all four
                  hold one line at the default column width. Local Media is
                  not repeated here: the Media panel already carries Image /
                  Video "upload" for local files. */}
              <div style={{ display: 'flex', gap: 3, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="svc-add" data-active={serviceAddMenu === 'song' ? '1' : '0'} onClick={() => setServiceAddMenu(serviceAddMenu === 'song' ? null : 'song')} title="Add a song from the library"><Music size={11} /> Add Song</button>
                <button className="svc-add" data-active={serviceAddMenu === 'scripture' ? '1' : '0'} onClick={() => { const open = serviceAddMenu !== 'scripture'; setServiceAddMenu(open ? 'scripture' : null); setScMsg(null); if (open && !bibleBooks) loadBibleBooks().then(r => { if (!r || !r.books) setScMsg({ err: (r && r.error) || 'Bible books could not be loaded.' }); }); }} title="Add Scripture straight to the section marked ADD TO — no need to open the Scripture tab"><BookOpen size={11} /> Scripture</button>
                <button className="svc-add" data-active={serviceAddMenu === 'media' ? '1' : '0'} onClick={() => { const open = serviceAddMenu !== 'media'; setServiceAddMenu(open ? 'media' : null); if (open) fetchMediaLibrary(); }} title="Images, video and announcements"><ImageIcon size={11} /> Media</button>
                <button className="svc-add" data-active={serviceAddMenu === 'deck' ? '1' : '0'} onClick={() => { const open = serviceAddMenu !== 'deck'; setServiceAddMenu(open ? 'deck' : null); setScMsg(null); }} title="Add a presentation to the section marked ADD TO"><Monitor size={11} /> Presentation</button>
              </div>
              <input type="file" id="service-media-input" accept="image/*,video/*" style={{ display: 'none' }} onChange={addMediaItemToService} />
              {serviceAddMenu === 'song' && (
                <div className="svc-menu" style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <input autoFocus value={serviceSongQuery} onChange={(e) => setServiceSongQuery(e.target.value)} placeholder="Search library songs…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 7, padding: '5px 8px', color: 'var(--ui-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  {/* The list scrolls instead of running off the panel — every
                      song stays reachable without typing a search. */}
                  {(() => {
                    const q = serviceSongQuery.trim().toLowerCase();
                    const list = songs.filter(s => !q || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q));
                    return (
                      <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 2, paddingRight: 2 }}>
                        {list.map(s => (
                          <button key={s.id} onClick={() => { addSongToService(s); setServiceSongQuery(''); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                            <span style={{ fontSize: 10, color: 'var(--ui-faint)', flexShrink: 0 }}>{s.artist || 'Unknown'} • + Add</span>
                          </button>
                        ))}
                        {songs.length === 0 && <div style={{ fontSize: 11, color: 'var(--ui-faint)', padding: 4 }}>No songs in library yet.</div>}
                        {songs.length > 0 && list.length === 0 && <div style={{ fontSize: 11, color: 'var(--ui-faint)', padding: 4 }}>No matches for “{serviceSongQuery}”.</div>}
                      </div>
                    );
                  })()}
                </div>
              )}
              {serviceAddMenu === 'media' && (
                <div className="svc-menu" style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Add Media</div>
                  <button onClick={() => { const open = !serviceMediaPicker; setServiceMediaPicker(open); if (open) fetchMediaLibrary(); }} title="Choose an image or video that is already in the app — nothing is re-uploaded" style={{ textAlign: 'left', background: serviceMediaPicker ? 'rgba(255,184,0,0.14)' : 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><Images size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Existing Media</span>
                    <span style={{ fontSize: 10, color: serviceMediaPicker ? '#FFC72C' : 'var(--ui-faint)' }}>{serviceMediaPicker ? 'Hide' : `${mediaLibrary.filter(a => a.kind === 'image' || a.kind === 'video').length} in app`}</span>
                  </button>
                  {serviceMediaPicker && (mediaLibrary.filter(a => a.kind === 'image' || a.kind === 'video').length === 0 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', border: '1px dashed var(--ui-border)', borderRadius: 7, padding: '8px', textAlign: 'center', lineHeight: 1.5 }}>
                      No images/videos in the app yet — use Image or Video below to upload one.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 170, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 2 }}>
                      {mediaLibrary.filter(a => a.kind === 'image' || a.kind === 'video').map((asset, i) => {
                        const label = asset.name || (() => { try { return decodeURIComponent(asset.url.split('/').pop().split('?')[0]); } catch (_) { return 'Media'; } })();
                        return (
                          <button key={asset.url + i} onClick={() => addExistingMediaToService(asset)} title={`Add "${label}" to the service order — already in the app, no upload`} style={{ position: 'relative', padding: 0, height: 46, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--ui-border)', background: '#000', cursor: 'pointer' }}>
                            {asset.kind === 'image'
                              ? <img src={asset.url} alt={label} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <LazyVideo src={asset.url} muted playsInline preload="metadata" rootMargin="200px" style={{ width: '100%', height: '100%' }} />}
                            <span style={{ position: 'absolute', right: 3, bottom: 3, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.72)', borderRadius: 3, padding: '1px 3px', color: '#fff' }}>{asset.kind === 'video' ? <Video size={8} /> : <ImageIcon size={8} />}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><ImageIcon size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Image</span>
                    <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>+ Upload</span>
                  </button>
                  <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><Video size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Video / Loop</span>
                    <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>+ Upload</span>
                  </button>
                  <button onClick={() => { openCustomSlideEditor(null); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Announcement</span>
                    <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>+ Add</span>
                  </button>
                </div>
              )}
              {serviceAddMenu === 'scripture' && (
                <div className="svc-menu" style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 5 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Add Scripture · {bibleTrans.toUpperCase()}</div>
                  {!bibleBooks ? (
                    <div style={{ fontSize: 10.5, color: scMsg?.err ? '#FF4545' : 'var(--ui-faint)', padding: 4, lineHeight: 1.45 }}>{scMsg?.err || 'Loading books…'}</div>
                  ) : (
                    <>
                      <Dropdown
                        tone="quiet"
                        value={scBook}
                        onChange={(v) => { setScBook(v); setScChapter(''); setScMsg(null); }}
                        options={(bibleBooks.books || []).map(b => ({ value: b.nr, label: b.name }))}
                        placeholder="Choose a book…"
                        title="Book"
                        maxHeight={288}
                        searchable
                        searchPlaceholder="Filter books…"
                      />
                      {(() => {
                        const book = (bibleBooks.books || []).find(b => String(b.nr) === String(scBook));
                        if (!book) return null;
                        return (
                          <div style={{ display: 'flex', gap: 5 }}>
                            <Dropdown
                              tone="quiet"
                              style={{ flex: 1 }}
                              value={scChapter}
                              onChange={(v) => { setScChapter(v); setScMsg(null); }}
                              options={Array.from({ length: book.chapters || 0 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
                              placeholder="Chapter…"
                              title="Chapter"
                            />
                            <input value={scVerses} onChange={(e) => { setScVerses(e.target.value); setScMsg(null); }} placeholder="Verses 16-18" title="Leave blank to add the whole chapter" style={{ ...selStyle, flex: 1.15, cursor: 'text' }} />
                          </div>
                        );
                      })()}
                    </>
                  )}
                  <button onClick={addScriptureNow} disabled={scBusy} title="Insert this passage into the section marked ADD TO" style={{ background: ACCENT, border: 'none', color: '#0D1014', padding: '7px 9px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: scBusy ? 'default' : 'pointer', opacity: scBusy ? 0.7 : 1 }}>
                    {scBusy ? 'Adding…' : `Add to ${serviceTargetTitle || 'end of order'}`}
                  </button>
                  {bibleBooks && scMsg?.err && <div style={{ fontSize: 10.5, color: '#FF4545', lineHeight: 1.45 }}>{scMsg.err}</div>}
                  {scMsg?.ok && <div style={{ fontSize: 10.5, color: '#36C982', lineHeight: 1.45 }}>{scMsg.ok}</div>}
                  <div style={{ fontSize: 9.5, color: 'var(--ui-faint)', lineHeight: 1.45 }}>Blank verses = whole chapter. Lands in the section marked ADD TO.</div>
                </div>
              )}
              {serviceAddMenu === 'deck' && (
                <div className="svc-menu" style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Add Presentation</div>
                  {(presentations || []).length === 0 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', padding: 4, lineHeight: 1.5 }}>No presentations yet — open Presentations in the dock below, then New Presentation or Import Slides.</div>
                  ) : (
                    <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 2, paddingRight: 2 }}>
                      {presentations.map(p => (
                        <button
                          key={p.id}
                          disabled={!!deckBusy}
                          onClick={async () => {
                            if (deckBusy) return;
                            setDeckBusy(p.id);
                            try {
                              const d = window.require ? await window.require('electron').ipcRenderer.invoke('db-get-presentation', p.id) : null;
                              if (d) { addPresentationToService(d); setServiceAddMenu(null); }
                            } finally {
                              setDeckBusy(null);
                            }
                          }}
                          title="Add to Service Plan — goes into the section you are working in"
                          style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                        >
                          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--ui-faint)', flexShrink: 0 }}>{deckBusy === p.id ? 'Adding…' : `${p.slideCount || 0} slides • + Add`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div onDragOver={(e) => { e.preventDefault(); if (internalDrag.current) { const t = scanDropTarget(e); setDrop(t.at, t.row); return; } e.dataTransfer.dropEffect = 'copy'; setServiceDragOver(true); }} onDragLeave={() => setServiceDragOver(false)} onDrop={dropOnOrder} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 6px 10px 4px', display: 'grid', gap: 3, alignContent: 'start', border: serviceDragOver ? '1px dashed #FFB800' : '1px dashed transparent', borderRadius: 10, margin: '0', background: serviceDragOver ? 'rgba(255,184,0,0.08)' : 'transparent' }}>
              {(activeService?.items || []).filter(i => i.item_type !== 'section_header').length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12, padding: 12 }}>Nothing in the order yet. Use Add Song / Scripture / Media / Presentation above, or open the Shows and Songs tabs and press + Plan on a row.</div>
              )}
              {(() => {
                const rows = [];
                let flatIdx = 0;
                (activeService?.items || []).forEach(item => {
                  if (item.item_type === 'section_header') rows.push({ type: 'header', item, idx: flatIdx });
                  else rows.push({ type: 'item', item, idx: flatIdx });
                  flatIdx++;
                });
                let itemNum = 0;
                let activeCollapsed = false;
                const body = rows.map((row, ri) => {
                  if (row.type === 'header') {
                    const collapsed = serviceCollapsed.includes(row.item.title);
                    activeCollapsed = collapsed;
                    const groupItems = (() => {
                      const out = [];
                      for (let k = ri + 1; k < rows.length && rows[k].type === 'item'; k++) out.push(rows[k]);
                      return out;
                    })();
                    return (
                      <div key={`h-${ri}`} className="svc-section" data-drop-idx={row.idx} data-drop-section="1" data-target={serviceTargetTitle === row.item.title ? '1' : '0'} onClick={() => sectionHeaderClick(row.idx, row.item.title)} onDoubleClick={(e) => { e.stopPropagation(); beginRenameSection(row.idx, row.item.title); }} title={`${row.item.title} — click to target + collapse/expand · double-click to rename · drop an item here to move it into this section`} style={{ cursor: sectionRenameIdx === row.idx ? 'default' : 'pointer', userSelect: sectionRenameIdx === row.idx ? 'text' : 'none', boxShadow: dropRow === row.idx ? 'inset 0 -2px 0 var(--kog-accent)' : 'none' }}>
                        {sectionRenameIdx === row.idx ? (
                          <input
                            autoFocus
                            value={sectionRenameTitle}
                            onChange={(e) => setSectionRenameTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') commitRenameSection();
                              if (e.key === 'Escape') { setSectionRenameIdx(null); setSectionRenameTitle(''); }
                            }}
                            onBlur={commitRenameSection}
                            placeholder="Section name"
                            style={{ flex: 1, minWidth: 0, background: 'rgba(255,184,0,0.12)', border: 'none', borderBottom: '1px dashed #FFB800', borderRadius: 0, color: 'var(--ui-text)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.3, outline: 'none', padding: '2px 0' }}
                          />
                        ) : (
                          <>
                            <span className="svc-section-chevron">{collapsed ? <ChevronRight size={11} color="var(--ui-faint)" /> : <ChevronDown size={11} color="var(--ui-faint)" />}</span>
                            <span className="svc-section-title">{row.item.title}</span>
                            <span className="svc-section-tail">
                              <button
                                onClick={(e) => { e.stopPropagation(); beginRenameSection(row.idx, row.item.title); }}
                                title="Rename section"
                                style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', cursor: 'pointer', padding: 1, display: 'flex', flexShrink: 0 }}
                              >
                                <Pencil size={10} />
                              </button>
                              <span>{groupItems.length} item{groupItems.length === 1 ? '' : 's'}</span>
                            </span>
                          </>
                        )}
                      </div>
                    );
                  }
                  if (activeCollapsed) return null;
                  itemNum++;
                  const isLive = serviceItemIsLive(row.item);
                  const isScripture = !!(row.item.meta && row.item.meta.kind === 'bible');
                  const icon = row.item.item_type === 'song' ? <Music size={12} /> : row.item.item_type === 'medley' ? <Link2 size={12} /> : isScripture ? <BookOpen size={12} /> : row.item.item_type === 'media' ? <ImageIcon size={12} /> : row.item.item_type === 'presentation' ? <MonitorPlay size={12} /> : <FileText size={12} />;
                  const iconColor = row.item.item_type === 'song' ? '#FFB800' : row.item.item_type === 'medley' ? '#FFC72C' : isScripture ? '#f59e0b' : 'var(--ui-muted)';
                  // Prism Slate: the row's function-kind owns its hue (song,
                  // medley, media, presentation, scripture) on every surface.
                  const rowKind = row.item.item_type === 'song' ? 'song' : row.item.item_type === 'medley' ? 'medley' : isScripture ? 'scripture' : (ROW_KIND[row.item.item_type] || null);
                  const rowIconColor = iconTheme === 'prism' && rowKind ? iconHue(rowKind, C) : iconColor;
                  const selectedRow = (row.item.item_type === 'song' && sameSongId(row.item.content, activeSong?.id)) || (row.item.item_type === 'custom_slide' && activeCue?.id === row.item.id);
                  const meta = row.item.subtitle || (row.item.item_type === 'song' ? 'Song' : row.item.item_type === 'media' ? 'Media' : row.item.item_type === 'presentation' ? 'Presentation' : 'Slide');
                  return (
                    <div key={`i-${ri}`} className="row svc-item" data-drop-idx={row.idx} data-selected={selectedRow ? '1' : '0'} data-live={isLive ? '1' : '0'} draggable onDragStart={(e) => { internalDrag.current = true; e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'reorder', from: row.idx })); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { internalDrag.current = false; setDrop(null, null); }} onClick={() => { if (row.item.item_type === 'song') selectSong(row.item.content); else if (isLive) return; else fireServiceItemLive(row.item); }} title="Drag to reorder · click to go live" style={{ boxShadow: dropRow === row.idx ? '0 0 0 2px rgba(255,184,0,0.6)' : 'none' }}>
                      {isLive && <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 3, background: 'var(--kog-success)' }} />}
                      <span className="svc-index">{isLive ? '▶' : itemNum}</span>
                      <span className="svc-kind" style={{ color: rowIconColor }}>{icon}</span>
                      <div className="svc-body">
                        <div className="svc-title" title={row.item.title}>{row.item.title}</div>
                        <div className="svc-meta" title={meta}>{meta}</div>
                      </div>
                      <div className="svc-actions">
                        {isLive ? (
                          <button onClick={(e) => { e.stopPropagation(); stopServiceItemLive(row.item); }} title="Stop — take this item off air" style={{ background: 'rgba(255,69,69,0.16)', border: '1px solid rgba(255,69,69,0.55)', color: 'var(--kog-error)', borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}>■ Stop</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); fireServiceItemLive(row.item); }} title="Go live" style={{ background: 'var(--kog-accent)', border: '1px solid var(--kog-accent)', color: '#0D1014', borderRadius: 5, fontSize: 10, fontWeight: 800, padding: '2px 7px', cursor: 'pointer' }}>Go</button>
                        )}
                        {(row.item.item_type === 'song' || row.item.item_type === 'medley') && (
                          <button onClick={(e) => { e.stopPropagation(); openMedleyForRow(row.item, row.idx); }} title={row.item.item_type === 'medley' ? 'Edit medley links' : 'Link songs into a medley'} style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: row.item.item_type === 'medley' ? '#FFC72C' : C.faint, padding: '2px 5px', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Link2 size={11} /></button>
                        )}
                        {(row.item.item_type === 'song' || row.item.item_type === 'medley') && (
                          <button onClick={(e) => { e.stopPropagation(); openArrangementForRow(row.item, row.idx); }} title={row.item.item_type === 'medley' ? 'Custom play order for the anchor song' : (row.item.meta?.arrangement?.order?.length ? 'Edit song arrangement' : 'Custom play order for this song')} style={{ background: row.item.meta?.arrangement?.order?.length ? 'rgba(255,184,0,0.16)' : 'transparent', border: '1px solid ' + (row.item.meta?.arrangement?.order?.length ? 'rgba(255,184,0,0.5)' : 'var(--ui-border)'), color: row.item.meta?.arrangement?.order?.length ? '#FFC72C' : C.faint, padding: '2px 5px', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ListMusic size={11} /></button>
                        )}
                        {row.item.item_type === 'custom_slide' && (
                          <button onClick={(e) => { e.stopPropagation(); openCustomSlideEditor(row.idx); }} title="Edit slide — text, font, colour, background, transition" style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: C.faint, padding: '2px 5px', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={11} /></button>
                        )}
                        <Trash2 size={11} color="var(--ui-faint)" onClick={(e) => { e.stopPropagation(); removeServiceItem(row.idx); }} style={{ cursor: 'pointer' }} />
                      </div>
                    </div>
                  );
                });
                return body;
              })()}
            </div>
          </div>
          )}

          {/* PANEL 3 — SONG LIBRARY */}
          {viewTab === 'songs' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* One header row: the search fills the empty space that used to
                sit beside + New when they lived on two separate rows — the
                list gets that whole band back. */}
            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={13} color="var(--ui-faint)" style={{ position: 'absolute', left: 9, top: 7, pointerEvents: 'none' }} />
                <input id="song-search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search songs…" style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '6px 8px 6px 27px', color: 'var(--ui-text)', fontSize: 12, outline: 'none' }} />
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleNewSong(); }} title="New song" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '4px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><Plus size={12} /> New</button>
              <button onClick={(e) => { e.stopPropagation(); setExportMsg(null); if (exportMode) setExportSel([]); setExportMode(!exportMode); }} title={exportMode ? 'Done selecting' : 'Tick songs to back up for transfer'} style={{ background: exportMode ? 'rgba(255,184,0,0.16)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (exportMode ? 'rgba(255,184,0,0.5)' : 'var(--ui-border)'), color: exportMode ? '#FFC72C' : 'var(--ui-text2)', padding: '4px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>Export</button>
            </div>
            {/* CATEGORY CHIPS — All / Favorites / Recent plus every category the
                table actually holds. One horizontally scrollable row: a library
                can carry many categories, and a wrapping grid would eat the
                vertical space the songs list needs. */}
            <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px 10px', overflowX: 'auto', flexShrink: 0 }}>
              {LIBRARY_CHIPS
                .concat((songCategories || [])
                  .filter((c) => c && !LIBRARY_CHIPS.some((f) => f.id === c))
                  .map((c) => ({ id: c, label: String(c) })))
                .map((chip) => {
                  const on = activeCategory === chip.id;
                  const ChipIcon = chip.Icon;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setActiveCategory(chip.id)}
                      title={chip.title || `Show every song filed under ${chip.label}`}
                      style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', background: on ? ACCENT : 'rgba(255,255,255,0.04)', border: '1px solid ' + (on ? ACCENT : 'var(--ui-border)'), color: on ? '#0D1014' : 'var(--ui-text2)', transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease' }}
                    >
                      {ChipIcon ? <ChipIcon size={11} fill={on && chip.id === 'Favorites' ? 'currentColor' : 'none'} /> : null}
                      {chip.label}
                    </button>
                  );
                })}
            </div>
            {exportMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 6px 10px', flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, color: C.faint || 'var(--ui-faint)', fontWeight: 700 }}>{exportSel.length} selected</span>
                <span style={{ flex: 1 }} />
                <button onClick={runExportSelected} disabled={!exportSel.length} title="Save the ticked songs to a backup file" style={{ background: exportSel.length ? ACCENT : 'rgba(255,255,255,0.04)', border: 'none', color: exportSel.length ? '#0D1014' : 'var(--ui-text2)', padding: '5px 12px', borderRadius: 7, fontSize: 10.5, fontWeight: 800, cursor: exportSel.length ? 'pointer' : 'default', opacity: exportSel.length ? 1 : 0.5 }}>Back up selected</button>
              </div>
            )}
            {exportMsg && (
              <div style={{ fontSize: 10.5, color: 'var(--ui-text2)', lineHeight: 1.5, background: 'rgba(255,184,0,0.10)', border: '1px solid rgba(255,184,0,0.35)', borderRadius: 7, padding: '6px 8px', margin: '0 10px 6px 10px', flexShrink: 0 }}>{exportMsg}</div>
            )}
            <>
            {/* shadcn ScrollArea: the native (system) scrollbar is hidden and
                a slim rounded thumb floats over the right edge instead — the
                look the songs list asks for. minmax(0, 1fr) keeps the implicit
                grid column from stretching to a long nowrap title — without it
                the track grows past the sidebar, the row overflows sideways and
                the action buttons end up behind a horizontal scrollbar. */}
            <ScrollArea overflowX={false} style={{ flex: 1, minHeight: 0, '--kog-accent': ACCENT }}>
            <div style={{ padding: '4px 8px 10px 8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, alignContent: 'start' }}>
              {/* Same as the shows list: the order is on another tab, so a
                  row is a plain click-to-open, not a drag handle. */}
              {songs.map(song => (
                <div key={song.id} className="row" onClick={() => (exportMode ? toggleExportSel(song.id) : selectSong(song.id))} title={exportMode ? 'Tick to include in backup' : 'Click to open this song · hover the row for + Plan'} style={{ background: exportMode && exportSel.includes(song.id) ? 'rgba(255,184,0,0.16)' : activeSong?.id === song.id ? 'rgba(255,184,0,0.15)' : 'var(--ui-elev2)', border: exportMode && exportSel.includes(song.id) ? '1px solid rgba(255,184,0,0.6)' : activeSong?.id === song.id ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '7px 11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {exportMode && (
                      <input type="checkbox" checked={exportSel.includes(song.id)} onChange={() => toggleExportSel(song.id)} onClick={(e) => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: '#FFB800', cursor: 'pointer', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--ui-muted)', marginTop: 2, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist || 'Unknown'} • {song.category}</span>
                    </div>
                  </div>
                  {/* The whole cluster waits for hover — star included — so a
                      list of songs reads as titles and artists rather than as
                      four icons per row fighting the text. */}
                  <div className="row-act" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); addSongToService(song); setViewTab('order'); }} title="Add to Service Plan — jumps to the order so you see it land" style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: '#FFC72C', padding: '3px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                    <Star size={13} color={song.is_favorite ? '#f59e0b' : 'var(--ui-faint)'} fill={song.is_favorite ? '#f59e0b' : 'none'} onClick={(e) => handleToggleFavorite(song.id, e)} style={{ cursor: 'pointer' }} />
                    <Edit3 size={13} color="var(--ui-muted)" onClick={(e) => { e.stopPropagation(); editSong(song.id); }} style={{ cursor: 'pointer' }} />
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSong(song.id); }} title="Delete song" style={{ background: 'rgba(255,69,69,0.10)', border: '1px solid rgba(255,69,69,0.28)', color: '#FF4545', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {songs.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12, lineHeight: 1.5 }}>
                  {activeCategory === 'Favorites'
                    ? 'No favorites yet — tap the star on a song to keep it here.'
                    : activeCategory === 'Recent'
                      ? 'No recent songs yet — open one and it lands here.'
                      : searchQuery
                        ? `No songs match “${searchQuery}”. Try a line from the lyrics.`
                        : 'No songs found.'}
                </div>
              )}
            </div>
            </ScrollArea>
            </>
          </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>
      );
    }
    if (dockTab === 'sermon') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="kog-guide-eyebrow">Slideshow decks</div>
          <button onClick={() => openPresentationEditor(null)} style={{ background: ACCENT, border: 'none', color: '#0D1014', padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} /> New Presentation</button>
          <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', lineHeight: 1.5 }}>Create a slideshow deck, present it live, or add it to the Home service order.</div>
          {(presentations || []).length === 0 && <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12, padding: 12, border: '1px dashed var(--ui-border)', borderRadius: 10 }}>No slideshow decks yet. Start a new presentation to build one.</div>}
          {(presentations || []).map(p => (
            <div key={p.id} style={{ background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '9px 11px', display: 'grid', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>{p.slideCount || 0} slide{(p.slideCount || 0) === 1 ? '' : 's'} • {String(p.updated_at || '').slice(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={async () => { const d = await (window.require ? window.require('electron').ipcRenderer.invoke('db-get-presentation', p.id) : null); if (d) addPresentationToService(d); }} title="Add to Service Plan — goes into the section you are working in" style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--ui-border)', color: '#FFC72C', padding: '5px 8px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Plus size={11} /> Plan</button>
                <button onClick={() => openPresentation(p.id)} title="Edit" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '5px 8px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Edit3 size={11} /> Edit</button>
                <button onClick={async () => { const d = await (window.require ? window.require('electron').ipcRenderer.invoke('db-get-presentation', p.id) : null); if (d) presentDeck(d); else openPresentation(p.id); }} title="Present live" style={{ background: ACCENT, border: 'none', color: '#0D1014', padding: '5px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Monitor size={11} /> Present</button>
                <button onClick={() => deletePresentationDeck(p.id)} title="Delete deck — asks for confirmation" style={{ background: 'rgba(255,69,69,0.10)', border: '1px solid rgba(255,69,69,0.28)', color: '#FF4545', cursor: 'pointer', padding: '4px 7px', borderRadius: 7, display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (dockTab === 'presentations') {
      return renderWorkspaceGuide('presentations');
    }
    if (dockTab === 'templates') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveCurrentTemplate} style={{ flex: 1, background: ACCENT, border: 'none', color: '#0D1014', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save Current as Template</button>
          </div>
          {templates.map(t => (
            <div key={t.id} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => applyTemplate(t.id)} style={{ textAlign: 'left', color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t.name}</button>
              <Trash2 size={13} color="#FF4545" onClick={() => removeTemplate(t.id)} style={{ cursor: 'pointer' }} />
            </div>
          ))}
          {templates.length === 0 && <div style={{ textAlign: 'center', color: C.faint2, fontSize: 12, padding: 12 }}>No templates yet.</div>}
        </div>
      );
    }


if (dockTab === 'media') {
      // Media lives in the centre workspace (MediaBrowser). The sidebar now
      // explains the workspace instead of duplicating the running order.
      return renderWorkspaceGuide('media');
    }
if (dockTab === 'audio') {
  // Audio owns the full centre workspace (AudioPanel: Song Audio / Pads /
  // BGM Playlist); the sidebar carries a short guide, not the service order.
  return renderWorkspaceGuide('audio');
}
if (dockTab === 'videos') {
  // Video library lives in the system sidebar on this tab (independent
  // browser: search, filters, cue/queue) while the player + Up Next own the
  // center — same shell as every other tool, its own body.
  return <VideoLibrarySidebar />;
}

    if (dockTab === 'countdown') {
      return renderWorkspaceGuide('countdown');
    }
    if (dockTab === 'stage') {
      return renderWorkspaceGuide('stage');
    }
    if (dockTab === 'scripture') {
      return renderWorkspaceGuide('scripture');
    }

    if (dockTab === 'calendar') {
      const sorted = [...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Saved Service Plans</span>
            <button onClick={openNewShow} style={{ background: PINK, border: 'none', color: C.text, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={12} /> New</button>
          </div>
          {sorted.length === 0 ? (
            <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>No saved services yet. Build one with "New Show" and hit Save.</div>
          ) : sorted.map(svc => (
            <div key={svc.id} style={{ background: C.elevated, border: activeService?.id === svc.id ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: svc.date ? '#f59e0b' : C.faint, display: 'block', letterSpacing: 1 }}>{svc.date ? new Date(svc.date + (svc.date.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={() => loadService(svc.id)} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 7, padding: '5px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Load</button>
                <button onClick={() => deleteSavedService(svc.id)} style={{ background: 'transparent', border: 'none', color: '#FF4545', cursor: 'pointer', padding: '3px 4px' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (dockTab === 'settings' || dockTab === 'functions') {
      // Settings opens as a workspace dialog (see App's handleDockSelect);
      // the sidebar never renders it inline.
      return null;
    }
    return null;
  })()}
  </div>

      {/* UTILITY TOOLS — preserves every destination the old bottom dock had. */}
      <div className="kog-sidebar-utility" aria-label="Production tools">
        {UTILITY_NAV.map(({ id, label, Icon, title }) => (
          <button
            key={id}
            type="button"
            data-active={dockTab === id ? '1' : '0'}
            onClick={() => goTo(id)}
            title={title}
          >
            <Icon size={14} strokeWidth={1.9} />
            <span>{label}</span>
            {id === 'sermon' && (presentations || []).length > 0 ? (
              <span className="kog-utility-count" title={`${presentations.length} saved slideshow decks`}>{presentations.length}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  </motion.div>
  {/* Reopen rail — navigation must always be one click away. */}
  {!leftOpen && (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      onClick={() => setLeftOpen(true)}
      title="Open navigation"
      aria-label="Open navigation"
      className="kog-rail"
    >
      <PanelLeftOpen size={16} />
      <img src={logoImage} alt="" style={{ width: 22, height: 22, objectFit: 'contain', opacity: 0.85, borderRadius: 4 }} />
    </motion.button>
  )}
  </>
  );
}
