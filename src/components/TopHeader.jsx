import React, { useState } from 'react';
import { Plus, Monitor, Network, Sun, Moon, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { stubTap, iconBtnTap } from '../lib/anim';
import RemoteMenu from './modals/RemoteMenu';
import logoImage from '../assets/logo.png';

export default function TopHeader({ C, PINK, activeMenu, setActiveMenu, menuItems, activeCue, toggleDevProjectorWindow, toggleStageWindow, openNewShow, themeDark, toggleTheme, ACCENT }) {
  const isLive = activeCue?.id !== 'clear' && activeCue !== null;
  const [remoteOpen, setRemoteOpen] = useState(false);
  const acc = ACCENT || C.heading;
  return (
    <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.05 }} style={{ background: C.panel, padding: '0 14px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ui-border2)', gap: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logoImage} alt="Logo" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 5 }} />
          <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.5 }}>KOG<span style={{ color: PINK }}>Worship</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
          {['file', 'edit', 'view', 'help'].map(m => (
            <div key={m} style={{ position: 'relative' }}>
              <motion.button {...stubTap} onClick={() => setActiveMenu(activeMenu === m ? null : m)} style={{ background: 'transparent', border: 'none', color: activeMenu === m ? C.text : C.muted, fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize', fontWeight: activeMenu === m ? 700 : 500 }}>{m}</motion.button>
              {activeMenu === m && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 5, display: 'grid', gap: 2, minWidth: 180, zIndex: 300, boxShadow: '0 14px 34px rgba(0,0,0,0.7)' }}>
                  {menuItems[m].map(item => (
                    <motion.button key={item.label} {...stubTap} onClick={() => { item.action(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: C.text2, padding: '7px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>{item.label}</motion.button>
                  ))}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT QUICK ACTIONS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: isLive ? 'rgba(34,197,94,0.1)' : C.elevated2, border: isLive ? '1px solid rgba(34,197,94,0.35)' : '1px solid var(--ui-border2)', borderRadius: 999 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: isLive ? '#22c55e' : C.faint2, boxShadow: isLive ? '0 0 8px #22c55e' : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: isLive ? '#22c55e' : C.muted, letterSpacing: 1 }}>{isLive ? 'LIVE' : 'OFFLINE'}</span>
        </div>
        <motion.button {...stubTap} onClick={toggleDevProjectorWindow} title="Projector outputs" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Monitor size={13} /> Outputs
        </motion.button>
        <motion.button {...stubTap} onClick={toggleStageWindow} title="Stage display" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Network size={13} /> Stage
        </motion.button>
        <div style={{ position: 'relative' }}>
          <motion.button {...stubTap} onClick={() => setRemoteOpen(v => !v)} title="Phone remote (LAN)" style={{ background: remoteOpen ? C.elevated : C.elevated2, border: `1px solid ${remoteOpen ? acc : C.border2}`, color: remoteOpen ? acc : C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Smartphone size={13} /> Remote
          </motion.button>
          {remoteOpen && <div onClick={() => setRemoteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />}
          <AnimatePresence>
            {remoteOpen && <RemoteMenu key="remote" C={C} ACCENT={acc} onClose={() => setRemoteOpen(false)} />}
          </AnimatePresence>
        </div>
        <motion.button {...stubTap} onClick={toggleTheme} title={themeDark ? 'Switch to light mode' : 'Switch to dark mode'} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          {themeDark ? <Sun size={13} /> : <Moon size={13} />}
        </motion.button>
        <motion.button {...stubTap} onClick={openNewShow} style={{ background: PINK, border: 'none', color: C.text, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> New Show
        </motion.button>
      </div>
    </motion.div>
  );
}
