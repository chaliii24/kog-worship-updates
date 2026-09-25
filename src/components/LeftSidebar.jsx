import React, { useState } from 'react';
import { Plus, Search, ChevronRight, ChevronDown, ChevronUp, Trash2, Star, Edit3, GripVertical, Image as ImageIcon, Video, Folder, FileText, Sparkles, Monitor, Download, Upload, Images, PanelLeftClose, Music, MonitorPlay, Pencil } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap, iconBtnTap } from '../lib/anim';

export default function LeftSidebar() {
  const app = useApp();
  const {
    C,
    PINK,
    ACCENT,
    leftOpen,
    setLeftOpen,
    dockTab,
    services,
    showsQuery,
    setShowsQuery,
    activeService,
    showsCollapsed,
    setShowsCollapsed,
    songs,
    activeSong,
    activeCue,
    songsCollapsed,
    setSongsCollapsed,
    searchQuery,
    setSearchQuery,
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
    serviceSlideCount,
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
    handleToggleFavorite,
    handleDeleteSong,
    setEditingSong,
    setEditorMode,
    setRawPasteText,
    setIsEditorOpen,
    handleNewSong,
    toggleDevProjectorWindow,
    toggleStageWindow,
    addNewDisplay,
    fireCueLive,
    setRightOpen,
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
    handleExport,
    handleImport,
    shellOpenDataFolder,
    setCustomSlideModal,
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
    presentDeck
  } = app;

  const [sectionRenameIdx, setSectionRenameIdx] = useState(null);
  const [sectionRenameTitle, setSectionRenameTitle] = useState('');

  const beginRenameSection = (idx, title) => {
    setSectionRenameIdx(idx);
    setSectionRenameTitle(title || '');
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

  return (
    <motion.div
      animate={{ width: leftOpen ? 340 : 0, opacity: leftOpen ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      style={{ flexShrink: 0, overflow: 'hidden', height: '100%', maxWidth: '35vw' }}
    >
    <div style={{ width: '100%', minWidth: 280, height: '100%', background: 'var(--ui-elev)', borderRight: '1px solid var(--ui-border)', flexDirection: 'column', display: 'flex' }}>
  {/* Sidebar header */}
  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
    {dockTab === 'shows' ? (
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Presentation</span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>{dockTab} Tools</span>
    )}
    {dockTab === 'shows' && (
      <motion.button {...stubTap} onClick={saveCurrentService} style={{ background: 'transparent', border: '1px solid #3B82F6', color: '#93C5FD', padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save Plan</motion.button>
    )}
    <motion.button {...iconBtnTap} onClick={() => setLeftOpen(false)} title="Minimize command center" style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}><PanelLeftClose size={16} /></motion.button>
  </div>

  {/* PER-TOOL BODY */}
  <div key={dockTab} className="sidebar-body">
  {(() => {
    if (dockTab === 'shows') {
      return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* PANEL 1 — SHOWS LIBRARY (Step 1) */}
          <div style={{ flex: showsCollapsed ? '0 0 auto' : '4 1 0', minHeight: showsCollapsed ? 0 : 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div onClick={() => setShowsCollapsed(v => !v)} title={showsCollapsed ? 'Expand Shows' : 'Collapse Shows'} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                {showsCollapsed ? <ChevronRight size={13} color="var(--ui-faint)" /> : <ChevronDown size={13} color="var(--ui-faint)" />} Shows
                <span style={{ color: 'var(--ui-faint)', fontWeight: 700, letterSpacing: 0 }}>({(services || []).length})</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); openNewShow(); }} title="New Show" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '4px 11px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Plus size={11} /> New Show</button>
            </div>
            {!showsCollapsed && (
              <>
                <div style={{ padding: '0 12px 6px 12px', position: 'relative', flexShrink: 0 }}>
                  <Search size={12} color="var(--ui-faint)" style={{ position: 'absolute', left: 20, top: 6 }} />
                  <input value={showsQuery} onChange={(e) => setShowsQuery(e.target.value)} placeholder="Filter shows…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '5px 8px 5px 25px', color: 'var(--ui-text)', fontSize: 11.5, outline: 'none' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px 10px', display: 'grid', gap: 6, alignContent: 'start' }}>
                  {[...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).filter(s => !showsQuery.trim() || (s.name || '').toLowerCase().includes(showsQuery.trim().toLowerCase())).map(svc => (
                    <div key={svc.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'show', id: svc.id })); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => loadService(svc.id)} title="Drag into Service Plan or click to load" style={{ background: activeService?.id === svc.id ? 'rgba(37,99,235,0.15)' : 'var(--ui-elev2)', border: activeService?.id === svc.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '8px 10px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--ui-faint)', display: 'block' }}>{svc.category || 'Worship'} • {svc.ratio || '16:9'} • {showItemCount(svc)} items</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); queueShowIntoService(svc.id); }} title="Add to Service Plan" style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: '#93C5FD', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSavedService(svc.id); }} title="Delete show" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
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
            )}
          </div>

          <div style={{ height: 1, background: 'var(--ui-border)', flexShrink: 0 }} />

          {/* PANEL 2 — SERVICE ORDER (G-Presenter style) */}
          <div style={{ flex: '6 1 0', minHeight: 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px 6px 12px', borderBottom: '1px solid var(--ui-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Service Order <span style={{ color: 'var(--ui-faint)', fontWeight: 700, letterSpacing: 0 }}>• {serviceOrderCount()} total item{serviceOrderCount() === 1 ? '' : 's'}</span></span>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={collapseAllServiceSections} title="Collapse all sections" style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', cursor: 'pointer', padding: '3px', display: 'flex' }}><ChevronUp size={13} /></button>
                  <button onClick={expandAllServiceSections} title="Expand all sections" style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', cursor: 'pointer', padding: '3px', display: 'flex' }}><ChevronDown size={13} /></button>
                  <button onClick={() => addHeaderToService('New Section')} title="+ New Section" style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--ui-border)', color: 'var(--ui-text2)', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><Plus size={11} /> Section</button>
                  <button onClick={clearServiceOrder} title="Clear order" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Add to</span>
                  <select
                    value={serviceTargetTitle || ''}
                    onChange={(e) => setServiceTargetTitle(e.target.value || null)}
                    title="Section that new songs, media, and slides go into"
                    style={{ flex: 1, minWidth: 0, background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(59,130,246,0.55)', borderRadius: 7, padding: '4px 6px', color: '#93C5FD', fontSize: 10.5, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">End of order</option>
                    {serviceSectionTitles().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setServiceAddMenu(serviceAddMenu === 'song' ? null : 'song')} title="Add Song" style={{ background: serviceAddMenu === 'song' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: serviceAddMenu === 'song' ? '1px solid #3B82F6' : '1px solid var(--ui-border)', color: serviceAddMenu === 'song' ? '#93C5FD' : 'var(--ui-text2)', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Music size={12} /> Add Song</button>
                <button onClick={() => { const open = serviceAddMenu !== 'media'; setServiceAddMenu(open ? 'media' : null); if (open) fetchMediaLibrary(); }} title="Add Media" style={{ background: serviceAddMenu === 'media' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: serviceAddMenu === 'media' ? '1px solid #3B82F6' : '1px solid var(--ui-border)', color: serviceAddMenu === 'media' ? '#93C5FD' : 'var(--ui-text2)', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><ImageIcon size={12} /> Add Media</button>
                <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} title="Local Media" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Folder size={12} /> Local Media</button>
              </div>
              <input type="file" id="service-media-input" accept="image/*,video/*" style={{ display: 'none' }} onChange={addMediaItemToService} />
              {serviceAddMenu === 'song' && (
                <div style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <input autoFocus value={serviceSongQuery} onChange={(e) => setServiceSongQuery(e.target.value)} placeholder="Search library songs…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 7, padding: '5px 8px', color: 'var(--ui-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  {songs.filter(s => !serviceSongQuery.trim() || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(serviceSongQuery.trim().toLowerCase())).slice(0, 8).map(s => (
                    <button key={s.id} onClick={() => { addSongToService(s); setServiceSongQuery(''); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                      <span style={{ fontSize: 10, color: 'var(--ui-faint)', flexShrink: 0 }}>{s.artist || 'Unknown'} • + Add</span>
                    </button>
                  ))}
                  {songs.length === 0 && <div style={{ fontSize: 11, color: 'var(--ui-faint)', padding: 4 }}>No songs in library yet.</div>}
                </div>
              )}
              {serviceAddMenu === 'media' && (
                <div style={{ marginTop: 6, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Add Media</div>
                  <button onClick={() => { const open = !serviceMediaPicker; setServiceMediaPicker(open); if (open) fetchMediaLibrary(); }} title="Choose an image or video that is already in the app — nothing is re-uploaded" style={{ textAlign: 'left', background: serviceMediaPicker ? 'rgba(37,99,235,0.14)' : 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><Images size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Existing Media</span>
                    <span style={{ fontSize: 10, color: serviceMediaPicker ? '#93C5FD' : 'var(--ui-faint)' }}>{serviceMediaPicker ? 'Hide' : `${mediaLibrary.filter(a => a.kind === 'image' || a.kind === 'video').length} in app`}</span>
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
                              ? <img src={asset.url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <video src={asset.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
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
                  <button onClick={() => { setCustomSlideModal(true); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--ui-text)', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Announcement</span>
                    <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>+ Add</span>
                  </button>
                </div>
              )}
            </div>
            <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setServiceDragOver(true); }} onDragLeave={() => setServiceDragOver(false)} onDrop={(e) => { e.preventDefault(); setServiceDragOver(false); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data.kind === 'show') queueShowIntoService(data.id); else if (data.kind === 'song') { const song = songs.find(s => s.id === data.id); if (song) addSongToService(song); } } catch (_) {} }} style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px 10px', display: 'grid', gap: 8, alignContent: 'start', border: serviceDragOver ? '1px dashed #3B82F6' : '1px dashed transparent', borderRadius: 10, margin: '0 8px', background: serviceDragOver ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
              {(activeService?.items || []).filter(i => i.item_type !== 'section_header').length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12, padding: 12 }}>Drop shows or songs here, or use + Add Song / + Media above to build the service order.</div>
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
                      <div key={`h-${ri}`} onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data && data.kind === 'reorder') moveServiceBlock(Number(data.from), row.idx); } catch (_) {} }} draggable={sectionRenameIdx !== row.idx} onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'reorder', from: row.idx })); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => { if (sectionRenameIdx === row.idx) return; setServiceTargetTitle(row.item.title); toggleServiceCollapse(row.item.title); }} onDoubleClick={(e) => { e.stopPropagation(); beginRenameSection(row.idx, row.item.title); }} title="Click = target + collapse/expand · Double-click = rename section" style={{ cursor: sectionRenameIdx === row.idx ? 'default' : 'grab', userSelect: sectionRenameIdx === row.idx ? 'text' : 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 10, color: serviceTargetTitle === row.item.title ? '#93C5FD' : 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.3, padding: '7px 6px 5px 6px', borderBottom: '1px solid var(--ui-border)', background: serviceTargetTitle === row.item.title ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
                        {sectionRenameIdx === row.idx ? null : (collapsed ? <ChevronRight size={12} color="var(--ui-faint)" /> : <ChevronDown size={12} color="var(--ui-faint)" />)}
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
                            style={{ flex: 1, minWidth: 0, background: 'rgba(37,99,235,0.12)', border: 'none', borderBottom: '1px dashed #3B82F6', borderRadius: 0, color: 'var(--ui-text)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.3, outline: 'none', padding: '2px 0' }}
                          />
                        ) : (
                          <>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{row.item.title}</span>
                            {serviceTargetTitle === row.item.title && <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 800, color: '#93C5FD', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 4, padding: '0 4px', letterSpacing: 0 }}>ADD TO</span>}
                          </>
                        )}
                        {sectionRenameIdx !== row.idx && (
                          <button
                            onClick={(e) => { e.stopPropagation(); beginRenameSection(row.idx, row.item.title); }}
                            title="Rename section"
                            style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', cursor: 'pointer', padding: 1, display: 'flex', flexShrink: 0 }}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--ui-faint)', fontWeight: 700, letterSpacing: 0, whiteSpace: 'nowrap' }}>{groupItems.length} item{groupItems.length === 1 ? '' : 's'}</span>
                      </div>
                    );
                  }
                  if (activeCollapsed) return null;
                  itemNum++;
                  const isLive = serviceItemIsLive(row.item);
                  const slideCount = serviceSlideCount(row.item);
                  const icon = row.item.item_type === 'song' ? <Music size={11} /> : row.item.item_type === 'media' ? <ImageIcon size={11} /> : row.item.item_type === 'presentation' ? <MonitorPlay size={11} /> : <FileText size={11} />;
                  const iconColor = row.item.item_type === 'song' ? '#3B82F6' : 'var(--ui-muted)';
                  return (
                    <div key={`i-${ri}`} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'reorder', from: row.idx })); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data && data.kind === 'reorder') moveServiceBlock(Number(data.from), row.idx); } catch (_) {} }}onClick={() => { if (row.item.item_type === 'song') selectSong(row.item.content); else if (isLive) return; else fireServiceItemLive(row.item); }} title="Drag to reorder; click to go live" style={{ position: 'relative', background: isLive ? 'rgba(34,197,94,0.10)' : (row.item.item_type === 'song' && Number(row.item.content) === activeSong?.id) || (row.item.item_type === 'custom_slide' && activeCue?.id === row.item.id) ? 'rgba(37,99,235,0.12)' : 'var(--ui-elev2)', border: isLive ? '1px solid rgba(34,197,94,0.55)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '6px 8px', cursor: 'grab', display: 'grid', gridTemplateColumns: '14px 20px 18px 1fr auto', gap: 6, alignItems: 'center' }}>
                      {isLive && <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 3, background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.8)' }} />}
                      <GripVertical size={12} color="var(--ui-faint)" />
                      <span style={{ fontSize: 10, fontWeight: 800, color: isLive ? '#22c55e' : 'var(--ui-faint)', fontFamily: 'monospace' }}>{isLive ? '▶' : itemNum}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: iconColor, textAlign: 'center' }}>{icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ui-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.item.title}</span>
                          {slideCount > 0 && <span style={{ fontSize: 8.5, background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)', color: 'var(--ui-muted)', borderRadius: 5, padding: '0 5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{slideCount} slide{slideCount === 1 ? '' : 's'}</span>}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--ui-faint)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.item.subtitle || (row.item.item_type === 'song' ? 'Song' : row.item.item_type === 'media' ? 'Media' : 'Slide')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        {isLive ? (
                          <button onClick={(e) => { e.stopPropagation(); stopServiceItemLive(row.item); }} title="Stop — take this item off air" style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.55)', color: '#F87171', borderRadius: 6, fontSize: 9.5, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>■ Stop</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); fireServiceItemLive(row.item); }} title="Go live" style={{ background: '#2563EB', border: '1px solid #2563EB', color: '#FFFFFF', borderRadius: 6, fontSize: 9.5, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>Go</button>
                        )}
                        <Trash2 size={12} color="var(--ui-faint)" onClick={(e) => { e.stopPropagation(); removeServiceItem(row.idx); }} style={{ cursor: 'pointer' }} />
                      </div>
                    </div>
                  );
                });
                return body;
              })()}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--ui-border)', flexShrink: 0 }} />

          {/* PANEL 3 — SONG LIBRARY (Step 2) */}
          <div style={{ flex: songsCollapsed ? '0 0 auto' : '4 1 0', minHeight: songsCollapsed ? 0 : 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div onClick={() => setSongsCollapsed(v => !v)} title={songsCollapsed ? 'Expand Songs' : 'Collapse Songs'} style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>
                {songsCollapsed ? <ChevronRight size={13} color="var(--ui-faint)" /> : <ChevronDown size={13} color="var(--ui-faint)" />} Songs
                <span style={{ color: 'var(--ui-faint)', fontWeight: 700, letterSpacing: 0 }}>({songs.length})</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); handleNewSong(); }} title="New song" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '4px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><Plus size={12} /> New</button>
            </div>
            {!songsCollapsed && (
              <>
                <div style={{ padding: '0 10px 6px 10px', position: 'relative', flexShrink: 0 }}>
                  <Search size={13} color="var(--ui-faint)" style={{ position: 'absolute', left: 19, top: 7 }} />
                  <input id="song-search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search songs…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '6px 8px 6px 27px', color: 'var(--ui-text)', fontSize: 12, outline: 'none' }} />
                </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 10px 8px', display: 'grid', gap: 6, alignContent: 'start' }}>
              {songs.map(song => (
                <div key={song.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'song', id: song.id })); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => selectSong(song.id)} title="Drag into Service Plan to queue it" style={{ background: activeSong?.id === song.id ? 'rgba(37,99,235,0.15)' : 'var(--ui-elev2)', border: activeSong?.id === song.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '7px 11px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ui-muted)', marginTop: 2, display: 'block' }}>{song.artist || 'Unknown'} • {song.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); addSongToService(song); }} title="Add to Service Plan" style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: '#93C5FD', padding: '3px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                    <Star size={13} color={song.is_favorite ? '#f59e0b' : 'var(--ui-faint)'} fill={song.is_favorite ? '#f59e0b' : 'none'} onClick={(e) => handleToggleFavorite(song.id, e)} style={{ cursor: 'pointer' }} />
                    <Edit3 size={13} color="var(--ui-muted)" onClick={(e) => { e.stopPropagation(); editSong(song.id); }} style={{ cursor: 'pointer' }} />
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSong(song.id); }} title="Delete song" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {songs.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12 }}>No songs found.</div>}
            </div>
              </>
            )}
          </div>
        </div>
      );
    }
    if (dockTab === 'presentations') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <button onClick={() => openPresentationEditor(null)} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} /> New Presentation</button>
          <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', lineHeight: 1.5 }}>Build sermon slides with text, images, backgrounds and transitions — then export to PowerPoint or send straight to the projector.</div>
          {(presentations || []).length === 0 && <div style={{ textAlign: 'center', color: 'var(--ui-faint)', fontSize: 12, padding: 12, border: '1px dashed var(--ui-border)', borderRadius: 10 }}>No presentations yet. Press "New Presentation" to start.</div>}
          {(presentations || []).map(p => (
            <div key={p.id} style={{ background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '9px 11px', display: 'grid', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ui-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                <span style={{ fontSize: 10, color: 'var(--ui-faint)' }}>{p.slideCount || 0} slide{(p.slideCount || 0) === 1 ? '' : 's'} • {String(p.updated_at || '').slice(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => openPresentation(p.id)} title="Edit" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '5px 8px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Edit3 size={11} /> Edit</button>
                <button onClick={async () => { const d = await (window.require ? window.require('electron').ipcRenderer.invoke('db-get-presentation', p.id) : null); if (d) presentDeck(d); else openPresentation(p.id); }} title="Present live" style={{ background: ACCENT, border: 'none', color: '#fff', padding: '5px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Monitor size={11} /> Present</button>
                <button onClick={() => deletePresentationDeck(p.id)} title="Delete" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '4px 7px', borderRadius: 7, display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (dockTab === 'live') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Outputs</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={toggleDevProjectorWindow} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Projector</button>
              <button onClick={toggleStageWindow} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Stage</button>
              <button onClick={addNewDisplay} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Add Virtual Wall</button>
              <button onClick={() => fireCueLive({ id: 'clear', label: 'Clear', text: '' })} style={{ background: '#1c1010', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Clear All Outputs</button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: 12, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Monitor</span>
            <button onClick={() => setRightOpen(true)} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}><Monitor size={13} /> Reopen Monitor Panel</button>
            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6 }}>This dock button toggles the Live Output monitor (right side). Keep it open to verify what is projected before the congregation sees it.</div>
          </div>
        </div>
      );
    }
    if (dockTab === 'templates') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveCurrentTemplate} style={{ flex: 1, background: ACCENT, border: 'none', color: C.text, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save Current as Template</button>
          </div>
          {templates.map(t => (
            <div key={t.id} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => applyTemplate(t.id)} style={{ textAlign: 'left', color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t.name}</button>
              <Trash2 size={13} color="#ef4444" onClick={() => removeTemplate(t.id)} style={{ cursor: 'pointer' }} />
            </div>
          ))}
          {templates.length === 0 && <div style={{ textAlign: 'center', color: C.faint2, fontSize: 12, padding: 12 }}>No templates yet.</div>}
        </div>
      );
    }


if (dockTab === 'media') {
      const songMedia = (activeSong?.cues || []).filter(cueHasBackground);
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Media Library</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <label style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <ImageIcon size={11} /> Image
                  <input type="file" accept="image/*" onChange={(e) => importMediaAsset(e, 'image')} style={{ display: 'none' }} />
                </label>
                <label style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Video size={11} /> Video
                  <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => importMediaAsset(e, 'video')} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            {mediaLibrary.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                No assets yet. Add an image/video background and it appears here — or import one now.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {mediaLibrary.map((asset, i) => (
                  <div key={i} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: 62, background: '#000', position: 'relative', overflow: 'hidden' }}>
                      {asset.kind === 'image' ? (
                        <img src={asset.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : asset.kind === 'video' ? (
                        <video src={asset.url} autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PINK }}><Music size={18} /></div>
                      )}
                      <span style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, background: 'rgba(0,0,0,0.65)', color: C.heading, borderRadius: 4, padding: '1px 5px' }}>{asset.kind}</span>
                        {asset.builtin && <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, background: 'rgba(34,197,94,0.18)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 4, padding: '1px 5px' }}>Built-in</span>}
                      </span>
                    </div>
                    <div style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                      {activeSong && asset.kind !== 'audio' && (
                        <button onClick={() => applyMediaToActiveSong(asset.kind, asset.url)} title="Apply to the active song" style={{ flex: 1, background: C.elevated, border: '1px solid var(--ui-border2)', color: '#4ade80', borderRadius: 6, fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>Song bg</button>
                      )}
                      {asset.kind === 'audio' && (
                        <button onClick={() => applyMediaToActiveSong('audio', asset.url)} title="Attach as background audio" style={{ flex: 1, background: '#1b3b2a', border: '1px solid #22c55e', color: '#4ade80', borderRadius: 6, fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>Attach</button>
                      )}
                      {!asset.builtin && (
                        <button onClick={() => removeMediaAsset(asset)} title="Remove file from library" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: '2px 4px' }}><Trash2 size={11} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {activeSong ? `Media triggers for "${activeSong.title}".` : 'Open a song to see its media triggers.'}
            </div>
            {songHasBackground(activeSong) && (
              <div style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 11px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 700 }}>Song background:</span> {activeSong.bg_type === 'color' ? `Color ${activeSong.bg_value}` : activeSong.bg_type}
              </div>
            )}
            {songMedia.map((cue, i) => (
              <div key={i} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 11px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: PINK, textTransform: 'uppercase', letterSpacing: 1 }}>{cue.label}</span>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                  {cue.bg_type === 'color' ? `Color ${cue.bg_value}` : `Media (${cue.bg_type})`}
                  {cue.duration > 0 && ` • ${cue.duration}s timer`}
                </div>
              </div>
            ))}
            {songMedia.length === 0 && !songHasBackground(activeSong) && <div style={{ fontSize: 12, color: C.faint2 }}>No media set on this song.</div>}
            <button onClick={() => { if (activeSong) { setEditingSong(activeSong); setEditorMode('manual'); setRawPasteText(''); setIsEditorOpen(true); } }} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '8px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Edit Song Media…</button>
          </div>
        </div>
      );
    }
if (dockTab === 'audio') {
      const songAudioAssets = mediaLibrary.filter(a => a.kind === 'audio');
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Active Song Audio</span>
            {activeSong ? (
              activeSong.audio_url ? (
                <div style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{activeSong.audio_url.split('/').pop().split('-').slice(1).join('-').split('.').slice(0, -1).join('.')}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleAudioPreview(activeSong.audio_url)} style={{ background: audioPreview === activeSong.audio_url ? 'rgba(255,79,163,0.2)' : C.elevated, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 7, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', flex: 1 }}>{audioPreview === activeSong.audio_url ? 'Stop Preview' : 'Preview'}</button>
                    <button onClick={clearSongAudio} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.faint, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 12 }}>
                  No audio for "{activeSong.title}". Import a track to loop it behind every slide of this song.
                </div>
              )
            ) : (
              <div style={{ fontSize: 12, color: C.faint, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 12 }}>Open a song first to assign background audio.</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Import & Attach</span>
            <label style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '8px', borderRadius: 8, fontSize: 11.5, cursor: activeSong ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Sparkles size={13} /> {activeSong ? `Attach audio to "${activeSong.title}"` : 'Open a song to attach audio'}
              <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.aac" onChange={(e) => importMediaAsset(e, 'audio')} disabled={!activeSong} style={{ display: 'none' }} />
            </label>
          </div>

          {audioPreview && (
            <div style={{ display: 'grid', gap: 6 }}>
              <audio key={audioPreview} src={audioPreview} controls autoPlay loop style={{ width: '100%', height: 38 }} />
              <button onClick={() => setAudioPreview(null)} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.muted, padding: '6px', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>Stop playback</button>
            </div>
          )}

          <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--ui-border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Audio Assets</span>
              <span style={{ fontSize: 10.5, color: C.faint2 }}>{songAudioAssets.length} track{songAudioAssets.length === 1 ? '' : 's'}</span>
            </div>
            {songAudioAssets.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint2 }}>No audio imported yet.</div>
            ) : songAudioAssets.map((asset, i) => (
              <div key={i} style={{ background: C.elevated, border: activeSong?.audio_url === asset.url ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: C.text2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.url.split('/').pop()}</span>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button onClick={() => toggleAudioPreview(asset.url)} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 6, padding: '3px 8px', fontSize: 10.5, cursor: 'pointer' }}>{audioPreview === asset.url ? 'Stop' : 'Play'}</button>
                  {activeSong && <button onClick={() => applyMediaToActiveSong('audio', asset.url)} style={{ background: '#1b3b2a', border: '1px solid #22c55e', color: '#4ade80', borderRadius: 6, padding: '3px 8px', fontSize: 10.5, cursor: 'pointer' }}>Attach</button>}
                  <button onClick={() => removeMediaAsset(asset)} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer' }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (dockTab === 'scripture') {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 12, alignContent: 'start' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Scripture</span>
          <div style={{ fontSize: 12, color: C.faint2, lineHeight: 1.7 }}>
            Bible versions, quick jump, and live controls now live in the <b>Scripture Browser header</b>. Open a version from the translation selector at the top-left of the workspace.
          </div>
          {bibleActiveEntry && (
            <div style={{ background: 'var(--ui-elev)', border: '1px solid var(--ui-border)', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Active Translation</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ui-text)' }}>{bibleActiveEntry.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>{(bibleActiveEntry.code || bibleActiveEntry.abbrev).toUpperCase()}{bibleActiveEntry.lang ? ` · ${bibleActiveEntry.lang}` : ''}</span>
            </div>
          )}
        </div>
      );
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
                <button onClick={() => deleteSavedService(svc.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '3px 4px' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (dockTab === 'functions') {
      const stats = libraryStats;
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {[
              { label: 'Songs', value: stats?.songs ?? '—' },
              { label: 'Slides', value: stats?.cues ?? '—' },
              { label: 'Services', value: stats?.services ?? '—' },
              { label: 'Templates', value: stats?.templates ?? '—' },
              { label: 'Media Assets', value: stats?.mediaAssets ?? '—' }
            ].map(s => (
              <div key={s.label} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.heading }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Data</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={handleExport} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Download size={12} /> Backup Library</button>
              <button onClick={handleImport} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Upload size={12} /> Import Library</button>
              {appInfo && <button onClick={() => shellOpenDataFolder()} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Open Data Folder</button>}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Outputs</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={toggleDevProjectorWindow} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Projector</button>
              <button onClick={addNewDisplay} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Add Virtual Wall</button>
            </div>
          </div>

          {appInfo && (
            <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.7, borderTop: '1px solid var(--ui-border)', paddingTop: 10 }}>
              <div>KOGWorship v{appInfo.version}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Data: {appInfo.dbPath}</div>
            </div>
          )}
        </div>
      );
    }
    return null;
  })()}
  </div>
  </div>
  </motion.div>
  );
}
