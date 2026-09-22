import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';

export default function ConfirmModal({ C, ACCENT, mode = 'confirm', title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    confirmRef.current?.focus();
    return () => {
      if (prev && prev !== document.body && typeof prev.focus === 'function') {
        try { prev.focus(); } catch (_) {}
      } else {
        document.body.focus?.();
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onConfirm, onCancel]);

  const Icon = mode === 'alert' ? AlertTriangle : HelpCircle;
  const isConfirm = mode === 'confirm';

  return (
    <motion.div
      {...modalOverlay}
      onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}
    >
      <motion.div
        {...modalPanel}
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: '1px solid #2d2d3f', borderRadius: '14px', width: '420px', maxWidth: '92vw', padding: '22px', boxSizing: 'border-box' }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={16} color={isConfirm ? C.accLine || ACCENT : '#F59E0B'} />
          {title || (isConfirm ? 'Confirm' : 'Notice')}
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', lineHeight: 1.5, color: C.sub || C.text, whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {isConfirm && (
            <motion.button
              {...stubTap}
              ref={cancelRef => { if (cancelRef && !confirmRef.current) { /* keep order */ } }}
              onClick={onCancel}
              style={{ background: C.border || '#1F2937', border: 'none', color: C.text, padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              {cancelLabel}
            </motion.button>
          )}
          <motion.button
            {...stubTap}
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              background: isConfirm ? '#EF4444' : ACCENT,
              border: 'none',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {confirmLabel}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
