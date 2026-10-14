import React from 'react';
import { motion } from 'motion/react';
import logoImage from '../assets/logo.png';

export default function TopHeader({ C, PINK, showName, showDate }) {
  return (
    <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.05 }} style={{ background: C.panel, padding: '0 14px', height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ui-border2)', gap: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <img src={logoImage} alt="Logo" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>KOG<span style={{ color: PINK }}>Worship</span></span>
          {showName ? (
            <>
              <span style={{ width: 1, height: 16, background: 'var(--ui-border2)', flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                <span title={showName} style={{ fontSize: 12.5, fontWeight: 700, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{showName}</span>
                {showDate ? (
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>{showDate}</span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* RIGHT — intentionally empty: live state moved to the output
          panel's red live edge (see LiveOutputPanel). Keeps the row balanced
          if a future status chip needs a home. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} />
    </motion.div>
  );
}
