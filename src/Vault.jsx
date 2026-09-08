import React, { useCallback, useEffect, useState } from "react";
import { LockScreen } from "./components/LockScreen.jsx";
import { decryptJSON, decryptWithKey, exportKey, importKey } from "./lib/crypto.js";
import { readJSON, writeJSON, remove } from "./lib/storage.js";
import { S, CSS } from "./styles.js";
import App from "./App.jsx";

const KEY_CACHE = "device-key";
const PAYLOAD_URL = `${import.meta.env.BASE_URL}caseload.enc.json`;

export default function Vault() {
  const [payload, setPayload] = useState(null);
  const [caseload, setCaseload] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [autoTried, setAutoTried] = useState(false);

  /* Fetch the encrypted caseload, then try the key this device already has. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let data;
      try {
        const res = await fetch(PAYLOAD_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${res.status}`);
        data = await res.json();
      } catch {
        if (alive) setLoadErr("Could not load the caseload file.");
        return;
      }
      if (!alive) return;
      setPayload(data);

      const cached = readJSON(KEY_CACHE);
      // A re-encrypted payload has a new salt, which retires the cached key.
      if (cached?.raw && cached.salt === data.salt) {
        try {
          const key = await importKey(cached.raw);
          const decoded = await decryptWithKey(data, key);
          if (alive) setCaseload(decoded);
        } catch {
          remove(KEY_CACHE);
        }
      }
      if (alive) setAutoTried(true);
    })();
    return () => { alive = false; };
  }, []);

  const unlock = useCallback(
    async (pass, rememberDevice) => {
      if (!payload) return false;
      try {
        const { data, key } = await decryptJSON(payload, pass);
        if (rememberDevice) {
          writeJSON(KEY_CACHE, { raw: await exportKey(key), salt: payload.salt });
        } else {
          remove(KEY_CACHE);
        }
        setCaseload(data);
        return true;
      } catch {
        return false;
      }
    },
    [payload]
  );

  const lock = useCallback(() => {
    remove(KEY_CACHE);
    setCaseload(null);
  }, []);

  if (loadErr) {
    return (
      <div style={S.lockWrap}>
        <style>{CSS}</style>
        <div style={S.lockCard}>
          <div style={S.lockMark}>sky<span style={{ color: "#F2687E" }}>+</span>mo</div>
          <div style={S.lockSub}>{loadErr} Check the connection and reload.</div>
          <button style={S.bigBtn} onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }

  if (!caseload) return <LockScreen onUnlock={unlock} autoTried={autoTried} />;

  return <App caseload={caseload} onLock={lock} />;
}
