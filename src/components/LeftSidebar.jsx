import React from 'react';
import { Plus, Search, ChevronRight, ChevronDown, ChevronUp, Trash2, Star, Edit3, GripVertical, Image as ImageIcon, Video, Folder, FileText, Sparkles, Monitor, Download, Upload, PanelLeftClose, Music, MonitorPlay } from 'lucide-react';
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
    toggleServiceCollapse,
    removeServiceItem,
    fireServiceItemLive,
    handleToggleFavorite,
    handleDeleteSong,
    setEditingSong,
    setEditorMode,
    setRawPasteText,
    setIsEditorOpen,
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
    presentations,
    openPresentationEditor,
    openPresentation,
    deletePresentationDeck,
    presentDeck
  } = app;

  return (
    <motion.div
      animate={{ width: leftOpen ? 340 : 0, opacity: leftOpen ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      style={{ flexShrink: 0, overflow: 'hidden', height: '100%', maxWidth: '35vw' }}
    >
    <div style={{ width: '100%', minWidth: 280, height: '100%', background: '#11161D', borderRight: '1px solid #1F2937', flexDirection: 'column', display: 'flex' }}>
  {/* Sidebar header */}
  <div style={{ padding: '10px 12px', borderBottom: '1px solid #1F2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
    {dockTab === 'shows' ? (
      <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Presentation</span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5 }}>{dockTab} Tools</span>
    )}
    {dockTab === 'shows' && (
      <motion.button {...stubTap} onClick={saveCurrentService} style={{ background: 'transparent', border: '1px solid #3B82F6', color: '#93C5FD', padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save Plan</motion.button>
    )}
    <motion.button {...iconBtnTap} onClick={() => setLeftOpen(false)} title="Minimize command center" style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}><PanelLeftClose size={16} /></motion.button>
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                {showsCollapsed ? <ChevronRight size={13} color="#64748B" /> : <ChevronDown size={13} color="#64748B" />} Shows
                <span style={{ color: '#475569', fontWeight: 700, letterSpacing: 0 }}>({(services || []).length})</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); openNewShow(); }} title="New Show" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', padding: '4px 11px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Plus size={11} /> New Show</button>
            </div>
            {!showsCollapsed && (
              <>
                <div style={{ padding: '0 12px 6px 12px', position: 'relative', flexShrink: 0 }}>
                  <Search size={12} color="#64748B" style={{ position: 'absolute', left: 20, top: 6 }} />
                  <input value={showsQuery} onChange={(e) => setShowsQuery(e.target.value)} placeholder="Filter shows…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 9, padding: '5px 8px 5px 25px', color: '#F8FAFC', fontSize: 11.5, outline: 'none' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px 10px', display: 'grid', gap: 6, alignContent: 'start' }}>
                  {[...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).filter(s => !showsQuery.trim() || (s.name || '').toLowerCase().includes(showsQuery.trim().toLowerCase())).map(svc => (
                    <div key={svc.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'show', id: svc.id })); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => loadService(svc.id)} title="Drag into Service Plan or click to load" style={{ background: activeService?.id === svc.id ? 'rgba(37,99,235,0.15)' : '#161B22', border: activeService?.id === svc.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid #1F2937', borderRadius: 10, padding: '8px 10px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#F8FAFC', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</span>
                        <span style={{ fontSize: 10, color: '#64748B', display: 'block' }}>{svc.category || 'Worship'} • {svc.ratio || '16:9'} • {svc.items?.length || 0} items</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); queueShowIntoService(svc.id); }} title="Add to Service Plan" style={{ background: 'transparent', border: '1px solid #1F2937', color: '#93C5FD', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSavedService(svc.id); }} title="Delete show" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                  {!services || services.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 11, padding: 10 }}>No shows yet. Press "New Show" to build your first presentation.</div>
                  ) : showsQuery.trim() && [...services].filter(s => (s.name || '').toLowerCase().includes(showsQuery.trim().toLowerCase())).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 11, padding: 8 }}>No shows match "{showsQuery}".</div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div style={{ height: 1, background: '#1F2937', flexShrink: 0 }} />

          {/* PANEL 2 — SERVICE ORDER (G-Presenter style) */}
          <div style={{ flex: '6 1 0', minHeight: 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px 6px 12px', borderBottom: '1px solid #1F2937', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5 }}>Service Order <span style={{ color: '#64748B', fontWeight: 700, letterSpacing: 0 }}>• {serviceOrderCount()} total item{serviceOrderCount() === 1 ? '' : 's'}</span></span>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={collapseAllServiceSections} title="Collapse all sections" style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '3px', display: 'flex' }}><ChevronUp size={13} /></button>
                  <button onClick={expandAllServiceSections} title="Expand all sections" style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '3px', display: 'flex' }}><ChevronDown size={13} /></button>
                  <button onClick={() => addHeaderToService('New Section')} title="+ New Section" style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed #334155', color: '#CBD5E1', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><Plus size={11} /> Section</button>
                  <button onClick={clearServiceOrder} title="Clear order" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setServiceAddMenu(serviceAddMenu === 'song' ? null : 'song')} title="Add Song" style={{ background: serviceAddMenu === 'song' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: serviceAddMenu === 'song' ? '1px solid #3B82F6' : '1px solid #1F2937', color: serviceAddMenu === 'song' ? '#93C5FD' : '#CBD5E1', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Music size={12} /> Add Song</button>
                <button onClick={() => setServiceAddMenu(serviceAddMenu === 'media' ? null : 'media')} title="Add Media" style={{ background: serviceAddMenu === 'media' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: serviceAddMenu === 'media' ? '1px solid #3B82F6' : '1px solid #1F2937', color: serviceAddMenu === 'media' ? '#93C5FD' : '#CBD5E1', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><ImageIcon size={12} /> Add Media</button>
                <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} title="Local Media" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Folder size={12} /> Local Media</button>
              </div>
              <input type="file" id="service-media-input" accept="image/*,video/*" style={{ display: 'none' }} onChange={addMediaItemToService} />
              {serviceAddMenu === 'song' && (
                <div style={{ marginTop: 6, background: '#161B22', border: '1px solid #1F2937', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <input autoFocus value={serviceSongQuery} onChange={(e) => setServiceSongQuery(e.target.value)} placeholder="Search library songs…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 7, padding: '5px 8px', color: '#F8FAFC', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  {songs.filter(s => !serviceSongQuery.trim() || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(serviceSongQuery.trim().toLowerCase())).slice(0, 8).map(s => (
                    <button key={s.id} onClick={() => { addSongToService(s); setServiceSongQuery(''); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: '#F8FAFC', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                      <span style={{ fontSize: 10, color: '#64748B', flexShrink: 0 }}>{s.artist || 'Unknown'} • + Add</span>
                    </button>
                  ))}
                  {songs.length === 0 && <div style={{ fontSize: 11, color: '#475569', padding: 4 }}>No songs in library yet.</div>}
                </div>
              )}
              {serviceAddMenu === 'media' && (
                <div style={{ marginTop: 6, background: '#161B22', border: '1px solid #1F2937', borderRadius: 9, padding: 6, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>Add Media</div>
                  <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: '#F8FAFC', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><ImageIcon size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Image</span>
                    <span style={{ fontSize: 10, color: '#64748B' }}>+ Add</span>
                  </button>
                  <button onClick={() => { const el = document.getElementById('service-media-input'); if (el) el.click(); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: '#F8FAFC', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><Video size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Video / Loop</span>
                    <span style={{ fontSize: 10, color: '#64748B' }}>+ Add</span>
                  </button>
                  <button onClick={() => { setCustomSlideModal(true); setServiceAddMenu(null); }} style={{ textAlign: 'left', background: 'transparent', border: 'none', color: '#F8FAFC', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />Announcement</span>
                    <span style={{ fontSize: 10, color: '#64748B' }}>+ Add</span>
                  </button>
                </div>
              )}
            </div>
            <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setServiceDragOver(true); }} onDragLeave={() => setServiceDragOver(false)} onDrop={(e) => { e.preventDefault(); setServiceDragOver(false); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data.kind === 'show') queueShowIntoService(data.id); else if (data.kind === 'song') { const song = songs.find(s => s.id === data.id); if (song) addSongToService(song); } } catch (_) {} }} style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px 10px', display: 'grid', gap: 8, alignContent: 'start', border: serviceDragOver ? '1px dashed #3B82F6' : '1px dashed transparent', borderRadius: 10, margin: '0 8px', background: serviceDragOver ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
              {(activeService?.items || []).filter(i => i.item_type !== 'section_header').length === 0 && (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 12 }}>Drop shows or songs here, or use + Add Song / + Media above to build the service order.</div>
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
                      <div key={`h-${ri}`} onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data && data.kind === 'reorder') moveServiceBlock(Number(data.from), row.idx); } catch (_) {} }} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'reorder', from: row.idx })); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => toggleServiceCollapse(row.item.title)} title="Drag to move section; click to collapse/expand" style={{ cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.3, padding: '7px 6px 5px 6px', borderBottom: '1px solid #1F2937' }}>
                        {collapsed ? <ChevronRight size={12} color="#64748B" /> : <ChevronDown size={12} color="#64748B" />}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{row.item.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#64748B', fontWeight: 700, letterSpacing: 0, whiteSpace: 'nowrap' }}>{groupItems.length} item{groupItems.length === 1 ? '' : 's'}</span>
                      </div>
                    );
                  }
                  if (activeCollapsed) return null;
                  itemNum++;
                  const isLive = serviceItemIsLive(row.item);
                  const slideCount = serviceSlideCount(row.item);
                  const icon = row.item.item_type === 'song' ? <Music size={11} /> : row.item.item_type === 'media' ? <ImageIcon size={11} /> : row.item.item_type === 'presentation' ? <MonitorPlay size={11} /> : <FileText size={11} />;
                  const iconColor = row.item.item_type === 'song' ? '#3B82F6' : '#94A3B8';
                  return (
                    <div key={`i-${ri}`} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'reorder', from: row.idx })); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data && data.kind === 'reorder') moveServiceBlock(Number(data.from), row.idx); } catch (_) {} }} onClick={() => { if (row.item.item_type === 'song') selectSong(row.item.content); else fireServiceItemLive(row.item); }} title="Drag to reorder; click to go live" style={{ position: 'relative', background: isLive ? 'rgba(34,197,94,0.10)' : (row.item.item_type === 'song' && Number(row.item.content) === activeSong?.id) || (row.item.item_type === 'custom_slide' && activeCue?.id === row.item.id) ? 'rgba(37,99,235,0.12)' : '#161B22', border: isLive ? '1px solid rgba(34,197,94,0.55)' : '1px solid #1F2937', borderRadius: 10, padding: '6px 8px', cursor: 'grab', display: 'grid', gridTemplateColumns: '14px 20px 18px 1fr auto', gap: 6, alignItems: 'center' }}>
                      {isLive && <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 3, background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.8)' }} />}
                      <GripVertical size={12} color="#475569" />
                      <span style={{ fontSize: 10, fontWeight: 800, color: isLive ? '#22c55e' : '#64748B', fontFamily: 'monospace' }}>{isLive ? '▶' : itemNum}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: iconColor, textAlign: 'center' }}>{icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.item.title}</span>
                          {slideCount > 0 && <span style={{ fontSize: 8.5, background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', borderRadius: 5, padding: '0 5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{slideCount} slide{slideCount === 1 ? '' : 's'}</span>}
                        </div>
                        <span style={{ fontSize: 10, color: '#64748B', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.item.subtitle || (row.item.item_type === 'song' ? 'Song' : row.item.item_type === 'media' ? 'Media' : 'Slide')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); fireServiceItemLive(row.item); }} title="Go live" style={{ background: isLive ? 'rgba(34,197,94,0.18)' : '#2563EB', border: isLive ? '1px solid rgba(34,197,94,0.5)' : '1px solid #2563EB', color: isLive ? '#22c55e' : '#FFFFFF', borderRadius: 6, fontSize: 9.5, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>{isLive ? 'LIVE' : 'Go'}</button>
                        <Trash2 size={12} color="#64748B" onClick={(e) => { e.stopPropagation(); removeServiceItem(row.idx); }} style={{ cursor: 'pointer' }} />
                      </div>
                    </div>
                  );
                });
                return body;
              })()}
            </div>
          </div>

          <div style={{ height: 1, background: '#1F2937', flexShrink: 0 }} />

          {/* PANEL 3 — SONG LIBRARY (Step 2) */}
          <div style={{ flex: songsCollapsed ? '0 0 auto' : '4 1 0', minHeight: songsCollapsed ? 0 : 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div onClick={() => setSongsCollapsed(v => !v)} title={songsCollapsed ? 'Expand Songs' : 'Collapse Songs'} style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>
                {songsCollapsed ? <ChevronRight size={13} color="#64748B" /> : <ChevronDown size={13} color="#64748B" />} Songs
                <span style={{ color: '#475569', fontWeight: 700, letterSpacing: 0 }}>({songs.length})</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); setEditingSong({ id: null, title: '', artist: '', category: 'Worship', cues: [{ label: 'Verse 1', text: '' }] }); setEditorMode('manual'); setRawPasteText(''); setIsEditorOpen(true); }} title="New song" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', padding: '4px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><Plus size={12} /> New</button>
            </div>
            {!songsCollapsed && (
              <>
                <div style={{ padding: '0 10px 6px 10px', position: 'relative', flexShrink: 0 }}>
                  <Search size={13} color="#64748B" style={{ position: 'absolute', left: 19, top: 7 }} />
                  <input id="song-search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search songs…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 9, padding: '6px 8px 6px 27px', color: '#F8FAFC', fontSize: 12, outline: 'none' }} />
                </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 10px 8px', display: 'grid', gap: 6, alignContent: 'start' }}>
              {songs.map(song => (
                <div key={song.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'song', id: song.id })); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => selectSong(song.id)} title="Drag into Service Plan to queue it" style={{ background: activeSong?.id === song.id ? 'rgba(37,99,235,0.15)' : '#161B22', border: activeSong?.id === song.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid #1F2937', borderRadius: 10, padding: '7px 11px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: '#F8FAFC', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</span>
                    <span style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2, display: 'block' }}>{song.artist || 'Unknown'} • {song.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); addSongToService(song); }} title="Add to Service Plan" style={{ background: 'transparent', border: '1px solid #1F2937', color: '#93C5FD', padding: '3px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>+ Plan</button>
                    <Star size={13} color={song.is_favorite ? '#f59e0b' : '#475569'} fill={song.is_favorite ? '#f59e0b' : 'none'} onClick={(e) => handleToggleFavorite(song.id, e)} style={{ cursor: 'pointer' }} />
                    <Edit3 size={13} color="#94A3B8" onClick={(e) => { e.stopPropagation(); editSong(song.id); }} style={{ cursor: 'pointer' }} />
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSong(song.id); }} title="Delete song" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {songs.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 12 }}>No songs found.</div>}
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
          <div style={{ fontSize: 10.5, color: '#64748B', lineHeight: 1.5 }}>Build sermon slides with text, images, backgrounds and transitions — then export to PowerPoint or send straight to the projector.</div>
          {(presentations || []).length === 0 && <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 12, border: '1px dashed #1F2937', borderRadius: 10 }}>No presentations yet. Press "New Presentation" to start.</div>}
          {(presentations || []).map(p => (
            <div key={p.id} style={{ background: '#161B22', border: '1px solid #1F2937', borderRadius: 10, padding: '9px 11px', display: 'grid', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: '#F8FAFC', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                <span style={{ fontSize: 10, color: '#64748B' }}>{p.slideCount || 0} slide{(p.slideCount || 0) === 1 ? '' : 's'} • {String(p.updated_at || '').slice(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => openPresentation(p.id)} title="Edit" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', padding: '5px 8px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Edit3 size={11} /> Edit</button>
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
              <button onClick={toggleDevProjectorWindow} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Projector</button>
              <button onClick={toggleStageWindow} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Stage</button>
              <button onClick={addNewDisplay} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Add Virtual Wall</button>
              <button onClick={() => fireCueLive({ id: 'clear', label: 'Clear', text: '' })} style={{ background: '#1c1010', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Clear All Outputs</button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #1F2937', paddingTop: 12, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Monitor</span>
            <button onClick={() => setRightOpen(true)} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.heading, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}><Monitor size={13} /> Reopen Monitor Panel</button>
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
            <div key={t.id} style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <label style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text2, padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <ImageIcon size={11} /> Image
                  <input type="file" accept="image/*" onChange={(e) => importMediaAsset(e, 'image')} style={{ display: 'none' }} />
                </label>
                <label style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text2, padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Video size={11} /> Video
                  <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => importMediaAsset(e, 'video')} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            {mediaLibrary.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed #2b2b44', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                No assets yet. Add an image/video background and it appears here — or import one now.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {mediaLibrary.map((asset, i) => (
                  <div key={i} style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, overflow: 'hidden' }}>
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
                        <button onClick={() => applyMediaToActiveSong(asset.kind, asset.url)} title="Apply to the active song" style={{ flex: 1, background: C.elevated, border: '1px solid #2b2b44', color: '#4ade80', borderRadius: 6, fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>Song bg</button>
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

          <div style={{ borderTop: '1px solid #1F2937', paddingTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {activeSong ? `Media triggers for "${activeSong.title}".` : 'Open a song to see its media triggers.'}
            </div>
            {songHasBackground(activeSong) && (
              <div style={{ background: C.elevated2, border: '1px solid #2b2b44', borderRadius: 10, padding: '8px 11px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 700 }}>Song background:</span> {activeSong.bg_type === 'color' ? `Color ${activeSong.bg_value}` : activeSong.bg_type}
              </div>
            )}
            {songMedia.map((cue, i) => (
              <div key={i} style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, padding: '8px 11px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: PINK, textTransform: 'uppercase', letterSpacing: 1 }}>{cue.label}</span>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                  {cue.bg_type === 'color' ? `Color ${cue.bg_value}` : `Media (${cue.bg_type})`}
                  {cue.duration > 0 && ` • ${cue.duration}s timer`}
                </div>
              </div>
            ))}
            {songMedia.length === 0 && !songHasBackground(activeSong) && <div style={{ fontSize: 12, color: C.faint2 }}>No media set on this song.</div>}
            <button onClick={() => { if (activeSong) { setEditingSong(activeSong); setEditorMode('manual'); setRawPasteText(''); setIsEditorOpen(true); } }} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.heading, padding: '8px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Edit Song Media…</button>
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
                <div style={{ background: C.elevated2, border: '1px solid #2b2b44', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{activeSong.audio_url.split('/').pop().split('-').slice(1).join('-').split('.').slice(0, -1).join('.')}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleAudioPreview(activeSong.audio_url)} style={{ background: audioPreview === activeSong.audio_url ? 'rgba(255,79,163,0.2)' : C.elevated, border: '1px solid #2b2b44', color: C.text, borderRadius: 7, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', flex: 1 }}>{audioPreview === activeSong.audio_url ? 'Stop Preview' : 'Preview'}</button>
                    <button onClick={clearSongAudio} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.faint, border: '1px dashed #2b2b44', borderRadius: 10, padding: 12 }}>
                  No audio for "{activeSong.title}". Import a track to loop it behind every slide of this song.
                </div>
              )
            ) : (
              <div style={{ fontSize: 12, color: C.faint, border: '1px dashed #2b2b44', borderRadius: 10, padding: 12 }}>Open a song first to assign background audio.</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Import & Attach</span>
            <label style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text2, padding: '8px', borderRadius: 8, fontSize: 11.5, cursor: activeSong ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Sparkles size={13} /> {activeSong ? `Attach audio to "${activeSong.title}"` : 'Open a song to attach audio'}
              <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.aac" onChange={(e) => importMediaAsset(e, 'audio')} disabled={!activeSong} style={{ display: 'none' }} />
            </label>
          </div>

          {audioPreview && (
            <div style={{ display: 'grid', gap: 6 }}>
              <audio key={audioPreview} src={audioPreview} controls autoPlay loop style={{ width: '100%', height: 38 }} />
              <button onClick={() => setAudioPreview(null)} style={{ background: C.elevated, border: '1px solid #2b2b44', color: C.muted, padding: '6px', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>Stop playback</button>
            </div>
          )}

          <div style={{ display: 'grid', gap: 6, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Audio Assets</span>
              <span style={{ fontSize: 10.5, color: C.faint2 }}>{songAudioAssets.length} track{songAudioAssets.length === 1 ? '' : 's'}</span>
            </div>
            {songAudioAssets.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint2 }}>No audio imported yet.</div>
            ) : songAudioAssets.map((asset, i) => (
              <div key={i} style={{ background: C.elevated, border: activeSong?.audio_url === asset.url ? `1px solid ${PINK}` : '1px solid #2b2b44', borderRadius: 10, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: C.text2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.url.split('/').pop()}</span>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button onClick={() => toggleAudioPreview(asset.url)} style={{ background: C.elevated, border: '1px solid #2b2b44', color: C.text, borderRadius: 6, padding: '3px 8px', fontSize: 10.5, cursor: 'pointer' }}>{audioPreview === asset.url ? 'Stop' : 'Play'}</button>
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
            <div style={{ background: '#11161D', border: '1px solid #1F2937', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.2 }}>Active Translation</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F8FAFC' }}>{bibleActiveEntry.name}</span>
              <span style={{ fontSize: 10.5, color: '#64748B' }}>{(bibleActiveEntry.code || bibleActiveEntry.abbrev).toUpperCase()}{bibleActiveEntry.lang ? ` · ${bibleActiveEntry.lang}` : ''}</span>
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
            <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed #2b2b44', borderRadius: 10, padding: 16, textAlign: 'center' }}>No saved services yet. Build one with "New Show" and hit Save.</div>
          ) : sorted.map(svc => (
            <div key={svc.id} style={{ background: C.elevated, border: activeService?.id === svc.id ? `1px solid ${PINK}` : '1px solid #2b2b44', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: svc.date ? '#f59e0b' : C.faint, display: 'block', letterSpacing: 1 }}>{svc.date ? new Date(svc.date + (svc.date.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={() => loadService(svc.id)} style={{ background: C.elevated, border: '1px solid #2b2b44', color: C.text, borderRadius: 7, padding: '5px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Load</button>
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
              <div key={s.label} style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.heading }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Data</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={handleExport} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Download size={12} /> Backup Library</button>
              <button onClick={handleImport} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Upload size={12} /> Import Library</button>
              {appInfo && <button onClick={() => shellOpenDataFolder()} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Open Data Folder</button>}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Outputs</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={toggleDevProjectorWindow} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Toggle Projector</button>
              <button onClick={addNewDisplay} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text, padding: '7px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>Add Virtual Wall</button>
            </div>
          </div>

          {appInfo && (
            <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.7, borderTop: '1px solid #1F2937', paddingTop: 10 }}>
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
