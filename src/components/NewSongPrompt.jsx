import React, { useEffect } from 'react';
import { Wand2, PenLine } from 'lucide-react';
import { useApp } from '../context/AppContext';
// Untitled UI — migration phase 1. These files live under src/untitledui/
// and mirror upstream's repo layout (MIT: github.com/untitleduico/react);
// the `@/` alias in vite.config.js resolves their internal imports.
import { Button } from '../untitledui/components/base/buttons/button';
import { CloseButton } from '../untitledui/components/base/buttons/close-button';
import { Badge } from '../untitledui/components/base/badges/badges';
// Phase 3: the modal SHELL is now Untitled's Modal/ModalOverlay/Dialog —
// React Aria gives us focus trap, Esc, backdrop press and enter animations
// (the framer modalOverlay/modalPanel shell is gone). App.jsx still owns
// mount state, so the overlay is controlled: isOpen (mounted = open) and
// onOpenChange(false) is the single close path (Esc and backdrop both).
import { Modal, ModalOverlay, Dialog } from '../untitledui/components/application/modals/modal';

// The option cards live at module scope — an inline component definition
// would get a fresh identity on every context re-render (the app context
// is a plain object) and remount the buttons mid-hover.
// Phase 1 of the Untitled UI migration: the card IS their <Button>
// (secondary/xl). `uu-root` opts it into the scoped preflight shim in
// index.css (border-box + zeroed UA chrome) so the global preflight stays
// un-imported. The [data-text] overrides style the wrapper span Button
// puts around its children — upstream exposes no layout prop for it.
function OptionCard({ mode, Icon, title, desc, tag, onChoose }) {
  return (
    <Button
      color="secondary"
      size="xl"
      onClick={() => onChoose(mode)}
      className="uu-root h-auto flex-[1_1_215px] min-w-0 flex-col items-start gap-2.5 rounded-xl px-4 py-4 text-left whitespace-normal [&>[data-text]]:flex [&>[data-text]]:w-full [&>[data-text]]:flex-col [&>[data-text]]:items-start [&>[data-text]]:gap-2.5 [&>[data-text]]:px-0"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-utility-brand-100 ring-1 ring-utility-brand-200 ring-inset">
          <Icon size={16} className="text-utility-brand-600" />
        </span>
        <span className="text-sm font-semibold text-primary">{title}</span>
      </span>
      {/* whitespace-normal directly on the desc: their Button root carries
          whitespace-nowrap, and white-space inherits — this beats the
          inheritance regardless of merge order. */}
      <span className="text-xs text-tertiary whitespace-normal">{desc}</span>
      <Badge color="brand" size="sm" className="uppercase">{tag}</Badge>
    </Button>
  );
}

// New Song flow, step 1: pick the start method BEFORE the editor opens.
//   'manual' → canvas Manual Builder (blank song, build slide by slide)
//   'auto'   → Smart Auto-Paste (lyrics / chord chart / lyrics-site link)
// The editor header tabs still allow switching afterwards.
export default function NewSongPrompt({ onChoose, onCancel }) {
  const { C } = useApp();

  // React Aria routes Esc → onOpenChange(false) → onCancel below. This
  // listener stays as a belt-and-braces path (idempotent setState) in case
  // focus ever sits outside the dialog while it is up.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    // z-[10000]: upstream's overlay defaults to z-50; the console's floating
    // chrome (dock tips, dropdown panels) sits at z 9999 and must stay under.
    // isDismissable = backdrop click closes (their default keeps Esc only).
    // box-border: upstream assumes Tailwind preflight (global border-box);
    // we keep preflight un-imported, so the overlay's px-* and the dialog's
    // padding would otherwise add OUTSIDE width:100% — pushing the cards
    // 20px past the panel's right edge and off-centering the modal.
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => { if (!open) onCancel(); }}
      className="box-border z-[10000]"
    >
      <Modal className="max-w-[540px]">
        <Dialog aria-label="Create New Song" className="box-border px-5 pt-5 pb-[15px]">
          <CloseButton size="xs" slot={null} label="Cancel" title="Cancel" onClick={onCancel} className="uu-root absolute top-1.5 right-1.5" />
          <h2 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 800, color: C.text }}>Create New Song</h2>
          <div style={{ fontSize: 12, color: C.muted }}>How do you want to start?</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <OptionCard mode="manual" Icon={PenLine} title="Manual Builder" desc="Start with one blank slide and build every verse, chorus and bridge by hand — full control over each box." tag="Build by hand" onChoose={onChoose} />
            <OptionCard mode="auto" Icon={Wand2} title="Smart Paste" desc="Paste plain lyrics, a chord chart, or a link from a lyrics site — sections are detected and slides are built for you." tag="Auto-generate" onChoose={onChoose} />
          </div>
          <div style={{ marginTop: 13, fontSize: 10.5, color: C.faint, textAlign: 'center' }}>
            You can switch between them any time in the editor header · Esc to cancel
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
