import React from "react";
import { S } from "../styles.js";

/* A crash mid-visit should not leave a blank screen in someone's hand. */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ ...S.app, padding: 24 }}>
        <div style={S.h1}>Something broke</div>
        <div style={S.sub}>
          Your saved work is untouched. Reloading usually clears it.
        </div>
        <div style={{ ...S.note, fontFamily: "ui-monospace, monospace", marginBottom: 16 }}>
          {String(this.state.err?.message || this.state.err)}
        </div>
        <button style={S.bigBtn} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
