import React, { useState } from 'react';
import { Monitor, Smartphone, HelpCircle, PanelRightClose, PanelRightOpen, Radio } from 'lucide-react';
import { MessageChatCircle } from '@untitledui/icons';
import { AnimatePresence } from 'motion/react';
import RemoteMenu from './modals/RemoteMenu';

const SECTION_LABEL = {
  shows: 'Home',
  presentations: 'Presentations',
  sermon: 'Slideshow',
  media: 'Media',
  videos: 'Videos',
  audio: 'Audio',
  countdown: 'Countdown',
  stage: 'Stage',
  scripture: 'Scripture',
  settings: 'Settings',
};

function fmtDate(value) {
  if (!value) return '';
  const s = String(value);
  try {
    return new Date(s.length === 10 ? s + 'T00:00:00' : s)
      .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

export default function TopHeader({
  C,
  PINK,
  ACCENT,
  showName,
  showDate,
  dockTab = 'shows',
  activeCue = null,
  activeLabel = '',
  slideIndex = -1,
  slideCount = 0,
  projectorOn = false,
  outputDisplays = [],
  selectedOutputDisplay = null,
  selectOutputDisplay,
  onOpenOutputs,
  onOpenHotkeys,
  onToggleOutput,
  rightOpen = true,
  setRightOpen,
  onOpenMessages,
  unreadMessages = 0,
}) {
  const [remoteOpen, setRemoteOpen] = useState(false);
  const active = activeCue != null && activeCue.id !== 'clear';
  const onAir = projectorOn && active;
  const date = fmtDate(showDate);
  const slideReadout = active && slideCount > 0 && slideIndex >= 0
    ? `Slide ${slideIndex + 1} / ${slideCount}`
    : active
      ? (activeLabel || 'Live')
      : 'No slide live';

  return (
    <header className="kog-app-header">
      <div className="kog-header-service">
        <div className="kog-header-service-title">
          <strong title={showName || 'KOG Worship'}>
            {showName || 'KOG Worship'}
          </strong>
          {date ? (
            <span className="kog-header-service-date" title={`Service date: ${date}`}>
              {date}
            </span>
          ) : null}
        </div>
        <span>{SECTION_LABEL[dockTab] || 'Workspace'}</span>
      </div>

      <span className="kog-status-pill" data-live={onAir ? '1' : '0'} title={onAir ? 'The live output is displaying this slide' : 'Nothing is on the live output'}>
        <span className="kog-dot" />
        {onAir ? 'Live' : 'Standby'}
      </span>

      <button
        type="button"
        className="kog-status-pill"
        data-live={projectorOn ? '1' : '0'}
        onClick={onToggleOutput}
        title={projectorOn ? 'Projector output is running — click to stop it' : 'Projector output is stopped — click to start it'}
        style={{ cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <Radio size={10} strokeWidth={2.4} />
        {projectorOn ? 'Output on' : 'Output off'}
      </button>

      <span className="kog-header-hide-md" style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }} title={slideReadout}>
        {slideReadout}
      </span>

      <span style={{ flex: 1 }} />

      {/* OUTPUT TRANSPORT — moved here from the removed bottom dock. */}
      <button
        type="button"
        className="kog-icon-btn kog-header-hide-sm"
        onClick={onOpenOutputs}
        title="Manage live outputs and displays"
      >
        <Monitor size={13} />
        <span>Outputs</span>
      </button>

      <select
        className="kog-header-select kog-header-hide-md"
        value={selectedOutputDisplay ?? ''}
        onChange={(e) => selectOutputDisplay && selectOutputDisplay(e.target.value === '' ? null : Number(e.target.value))}
        disabled={!outputDisplays || outputDisplays.length === 0}
        title="Choose which display or projector the live output appears on"
      >
        {(!outputDisplays || outputDisplays.length === 0) ? (
          <option value="">No external display detected</option>
        ) : (
          <>
            <option value="">Off — no output window</option>
            {outputDisplays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}{d.primary ? ' (Primary)' : ''} · {d.width}×{d.height}
              </option>
            ))}
          </>
        )}
      </select>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="kog-icon-btn kog-header-hide-sm"
          data-active={remoteOpen ? '1' : '0'}
          onClick={() => setRemoteOpen((v) => !v)}
          title="Phone remote (LAN)"
        >
          <Smartphone size={13} />
          <span>Remote</span>
        </button>
        {remoteOpen && <div onClick={() => setRemoteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />}
        <AnimatePresence>
          {remoteOpen && <RemoteMenu key="remote" C={C} ACCENT={ACCENT} onClose={() => setRemoteOpen(false)} />}
        </AnimatePresence>
      </div>

      <button
        type="button"
        className="kog-icon-btn kog-header-hide-sm"
        onClick={onOpenHotkeys}
        title="Keyboard shortcuts"
      >
        <HelpCircle size={14} />
      </button>

      <button
        type="button"
        className="kog-icon-btn"
        onClick={() => onOpenMessages && onOpenMessages()}
        title="Messages from remote controllers"
        aria-label="Messages from remote controllers"
        style={{ position: 'relative' }}
      >
        <MessageChatCircle size={15} />
        {unreadMessages > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 900, borderRadius: 9, padding: '0 4px', minWidth: 14, textAlign: 'center' }}>{unreadMessages}</span>
        )}
      </button>
    </header>
  );
}
