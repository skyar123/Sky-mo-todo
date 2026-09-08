import React, { useEffect, useRef, useState } from "react";
import { S, CSS, LINE } from "../styles.js";

/* The passcode is never stored. When "remember" is on, the derived AES key is
   cached instead, which unlocks instantly and keeps the passcode itself out of
   local storage. Clearing it is one tap on the lock button in the header. */
export function LockScreen({ onUnlock, autoTried }) {
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (autoTried) input.current?.focus();
  }, [autoTried]);

  async function submit(e) {
    e.preventDefault();
    if (busy || !pass) return;
    setBusy(true);
    setErr("");
    // Let the browser paint the busy state before the key stretch blocks it.
    await new Promise((r) => setTimeout(r, 20));
    const ok = await onUnlock(pass, remember);
    if (!ok) {
      setErr("That passcode did not work.");
      setPass("");
      input.current?.focus();
    }
    setBusy(false);
  }

  return (
    <div style={S.lockWrap}>
      <style>{CSS}</style>
      <form style={S.lockCard} onSubmit={submit}>
        <div style={S.lockMark}>
          sky<span style={{ color: "#F2687E" }}>+</span>mo
        </div>
        <div style={S.lockSub}>
          {autoTried ? "Enter your passcode to unlock the board." : "Checking this device…"}
        </div>

        <label className="sr-only" htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          ref={input}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setErr(""); }}
          style={S.lockInput}
          placeholder="••••"
          disabled={busy || !autoTried}
        />

        <div style={S.lockErr} role="alert">{err}</div>

        <button type="submit" style={{ ...S.bigBtn, opacity: busy || !pass ? 0.5 : 1 }} disabled={busy || !pass}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <label style={S.lockRow}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#2F2A3D" }}
          />
          Stay unlocked on this device
        </label>

        <div style={{ ...S.tip, borderTop: `1px solid ${LINE}`, paddingTop: 14, marginTop: 22, textAlign: "left" }}>
          The caseload is encrypted. Nothing readable is stored on the server, and
          the passcode never leaves this device.
        </div>
      </form>
    </div>
  );
}
