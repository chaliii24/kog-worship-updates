import React from 'react';
import { motion } from 'motion/react';

function Brand({ C, size = 4.6 }) {
  return (
    <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: `${size}rem`, fontWeight: 900, letterSpacing: '-0.03em', display: 'inline-block', lineHeight: 1.05 }}>
      {'KOGWorship'.split('').map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 30, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.25 + i * 0.05, type: 'spring', stiffness: 320, damping: 26 }}
          style={{ display: 'inline-block', color: i < 3 ? '#ffffff' : C.accLine, willChange: 'transform' }}
        >
          {c}
        </motion.span>
      ))}
    </span>
  );
}

export default function SplashScreen({ C, logoImage }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ position: 'fixed', inset: 0, background: '#050509', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 9999, fontFamily: 'system-ui, sans-serif', color: C.text, overflow: 'hidden' }}
    >
      {/* Pulsing ambient flash behind the brand */}
      <motion.div
        animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.12, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, ${C.accLine}33 0%, rgba(129,140,248,0.07) 40%, transparent 70%)`, filter: 'blur(70px)', top: '50%', left: '50%', margin: '-280px 0 0 -280px', zIndex: 0 }}
      />
      {/* Expanding ring flash */}
      <motion.div
        animate={{ opacity: [0, 0.5, 0], scale: [0.6, 1, 1.2] }}
        transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 0.9, ease: 'easeOut' }}
        style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', border: '1px solid rgba(129,140,248,0.4)', top: '50%', left: '50%', margin: '-120px 0 0 -120px', zIndex: 0, pointerEvents: 'none' }}
      />

      <motion.div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, scale: 0.7, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}>
          <img src={logoImage} alt="KOG Worship Logo" style={{ width: 148, height: 148, objectFit: 'contain', borderRadius: 28, boxShadow: `0 0 60px ${C.accLine}55`, marginBottom: 30 }} />
        </motion.div>
        <Brand C={C} />
        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.9, duration: 0.6 }}
          style={{ fontSize: '1rem', color: C.accLine, fontWeight: 700, margin: '18px 0 0 0', textTransform: 'uppercase', letterSpacing: '7px' }}
        >
          Presentation Suite
        </motion.p>
      </motion.div>

      {/* Fluid progress line — mirrors the splash duration */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 4.6, ease: 'easeInOut' }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, transformOrigin: 'left center', background: `linear-gradient(90deg, rgba(129,140,248,0) 0%, ${C.accLine} 100%)`, zIndex: 1 }}
      />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.8 }} style={{ position: 'absolute', bottom: 26, zIndex: 1, fontSize: 12.5, color: C.faint }}>
        Designed &amp; Built by <span style={{ color: '#f3f4f6', fontWeight: 700 }}>Charles Arradaza</span>
      </motion.div>
    </motion.div>
  );
}