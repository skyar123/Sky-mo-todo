import React, { useId, useState } from "react";
import { S } from "../styles.js";

export function Fold({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <div style={S.fold}>
      <button onClick={() => setOpen(!open)} style={S.foldHead} aria-expanded={open} aria-controls={id}>
        <span>{title}</span>
        <span style={{ opacity: 0.4 }} aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div id={id} hidden={!open} style={{ paddingBottom: 8 }}>{children}</div>
    </div>
  );
}

export function Field({ label, body }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={S.fieldLabel}>{label}</div>
      <div style={S.fieldBody}>{body}</div>
    </div>
  );
}

export function VisitRow({ c, count, overdue, supplies, changed, onClick }) {
  const bring = supplies && supplies.length ? supplies.join(", ").toLowerCase() : "";
  return (
    <button onClick={onClick} style={S.visit}>
      <span style={S.visitTime}>{c.time || "—"}</span>
      <span style={{ ...S.dot, background: c.color }} aria-hidden="true" />
      <span style={{ flex: 1 }}>
        <span style={S.visitName}>{c.name}</span>
        {bring && <span style={S.supLine}>bring {bring}</span>}
      </span>
      {changed && (
        <span
          style={{ ...S.dot, width: 7, height: 7, background: "#5C6BD8" }}
          title="Changed since you last looked"
          aria-label="Changed since you last looked"
        />
      )}
      {overdue > 0 && (
        <span style={S.visitFlag} title={`${overdue} overdue`}>{overdue} late</span>
      )}
      {count > 0 && <span style={S.visitCount}>{count}</span>}
    </button>
  );
}

export function Toast({ toast, onAction }) {
  if (!toast) return null;
  return (
    <div style={S.toast} className="noprint" role="status" aria-live="polite">
      <span>{toast.msg}</span>
      {toast.actionLabel && (
        <button style={S.toastBtn} onClick={onAction}>{toast.actionLabel}</button>
      )}
    </div>
  );
}
