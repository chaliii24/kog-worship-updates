import React from 'react';

// One broken panel must never take the console down mid-service.
//
// Without a boundary, any render throw inside a workspace (a malformed cue, a
// corrupt media record, an import that returns an unexpected shape) unmounts
// the whole React tree — the operator sees a black window with no way back.
// This boundary keeps the rest of the app alive: the navigation rail, the live
// output panel and the projector keep running, and the failed area offers a
// one-click reload. Changing workspace resets it automatically.
export default class WorkspaceBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the full stack in the console for support cases; the UI stays calm.
    try {
      console.error(`[${this.props.area || 'workspace'}] panel render failed`, error, info && info.componentStack);
    } catch {}
  }

  componentDidUpdate(prevProps) {
    // Navigating away is the natural "try again" — clear the error so the next
    // workspace mounts cleanly instead of inheriting this one's failure.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const message = String((this.state.error && this.state.error.message) || this.state.error || 'Unknown error');
    return (
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--ui-stage)' }}>
        <div style={{ width: '100%', maxWidth: 430, border: '1px solid var(--ui-border2)', borderRadius: 12, background: 'var(--ui-elev)', padding: '22px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ui-text)', marginBottom: 6 }}>This panel hit a snag</div>
          <p style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.6, color: 'var(--ui-muted)' }}>
            The rest of the app is still running — your live output was not touched. Reload the panel, or switch to another tab and come back.
          </p>
          <button
            type="button"
            onClick={this.retry}
            style={{ height: 32, padding: '0 16px', border: '1px solid var(--kog-accent)', borderRadius: 6, background: 'var(--kog-accent-bg)', color: 'var(--kog-accent-hover)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Reload panel
          </button>
          <div style={{ marginTop: 14, fontSize: 10.5, lineHeight: 1.5, color: 'var(--ui-faint)', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}>{message}</div>
        </div>
      </div>
    );
  }
}
